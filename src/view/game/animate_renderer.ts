import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { hsvColor, applyPrimaryColor } from './color_utils'
import type { Plan } from '../../model/types/Plan'
import type { WorldSnapshot } from '../../model/types/DerivedPlanState'
import type { TileCentersApi } from '../../controller/layer_0/tile_centers_api'
import crateUrl from '../../assets/items/crate.glb?url'
import carUrl from '../../assets/items/vehicles/car.glb?url'
import boatUrl from '../../assets/items/vehicles/boat.glb?url'

const CRATE_SCALE = 0.004
const CRATE_ON_VEHICLE_OFFSET = 0.015
const UP = new THREE.Vector3(0, 1, 0)

const VEHICLE_MESH_URLS: Record<string, string> = {
  'assets/items/vehicles/car.glb': carUrl,
  'assets/items/vehicles/boat.glb': boatUrl,
}

function cloneMaterials(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (Array.isArray(child.material)) {
      child.material = child.material.map((m) => m.clone())
    } else {
      child.material = child.material.clone()
    }
  })
}

/** Compute the world-space position + outward normal for a tile. */
function tileWorldPos(tileId: number, tileApi: TileCentersApi, globeCenter: THREE.Vector3): { pos: THREE.Vector3; normal: THREE.Vector3 } | null {
  const tile = tileApi.getTileById(tileId)
  if (!tile) return null
  const pos = new THREE.Vector3(tile.x, tile.z, -tile.y)
  const normal = pos.clone().sub(globeCenter).normalize()
  return { pos, normal }
}

/**
 * Manages Three.js meshes used exclusively during ANIMATE mode.
 * All meshes are added to the provided scene and cleaned up on dispose().
 */
export class AnimateRenderer {
  private readonly scene: THREE.Scene
  private readonly gltfCache = new Map<string, GLTF>()
  private vehicleMeshes = new Map<number, THREE.Object3D>()
  private crateMeshes = new Map<number, THREE.Object3D>()
  /** crateId → vehicleId for crates currently attached to vehicles */
  private crateVehicle = new Map<number, number>()
  private objects: THREE.Object3D[] = []

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  async setup(
    plan: Plan,
    snapshot: WorldSnapshot,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
  ): Promise<void> {
    // Vehicles
    for (const [vehicleIdStr, tileId] of snapshot.vehiclePositions) {
      const vehicleId = Number(vehicleIdStr)
      const vehicle = plan.vehicles[vehicleId]
      if (!vehicle) continue
      const url = VEHICLE_MESH_URLS[vehicle.vehicleType.meshPath]
      if (!url) continue
      const wp = tileWorldPos(tileId, tileApi, globeCenter)
      if (!wp) continue

      const gltf = await this.loadGltf(url)
      const obj = gltf.scene.clone()
      cloneMaterials(obj)
      obj.scale.setScalar(vehicle.vehicleType.scale)
      obj.quaternion.setFromUnitVectors(UP, wp.normal)
      obj.position.copy(wp.pos).addScaledVector(wp.normal, vehicle.vehicleType.offsetAlongNormal)
      applyPrimaryColor(obj, hsvColor(vehicle.hue))

      this.scene.add(obj)
      this.objects.push(obj)
      this.vehicleMeshes.set(vehicleId, obj)
    }

    // Crates on ground
    for (const [crateIdStr, tileId] of snapshot.crateOnGround) {
      const crateId = Number(crateIdStr)
      const wp = tileWorldPos(tileId, tileApi, globeCenter)
      if (!wp) continue

      const gltf = await this.loadGltf(crateUrl)
      const obj = gltf.scene.clone()
      cloneMaterials(obj)
      obj.scale.setScalar(CRATE_SCALE)
      obj.quaternion.setFromUnitVectors(UP, wp.normal)
      obj.position.copy(wp.pos)

      this.scene.add(obj)
      this.objects.push(obj)
      this.crateMeshes.set(crateId, obj)
    }

    // Crates already on vehicles
    for (const [vehicleIdStr, crateIds] of snapshot.vehicleCargo) {
      const vehicleId = Number(vehicleIdStr)
      let slotIndex = 0
      for (const crateId of crateIds) {
        if (this.crateMeshes.has(crateId)) {
          this.attachCrateToVehicle(crateId, vehicleId, slotIndex)
          slotIndex++
        } else {
          // Create the crate mesh for an already-loaded crate
          const vehicleMesh = this.vehicleMeshes.get(vehicleId)
          if (!vehicleMesh) continue
          const gltf = await this.loadGltf(crateUrl)
          const obj = gltf.scene.clone()
          cloneMaterials(obj)
          obj.scale.setScalar(CRATE_SCALE)
          const offset = new THREE.Vector3(0, CRATE_ON_VEHICLE_OFFSET * (slotIndex + 1), 0)
          obj.position.copy(offset)
          vehicleMesh.add(obj)
          this.objects.push(obj)
          this.crateMeshes.set(crateId, obj)
          this.crateVehicle.set(crateId, vehicleId)
          slotIndex++
        }
      }
    }
  }

  getVehicleMesh(vehicleId: number): THREE.Object3D | undefined {
    return this.vehicleMeshes.get(vehicleId)
  }

  getCrateMesh(crateId: number): THREE.Object3D | undefined {
    return this.crateMeshes.get(crateId)
  }

  placeVehicleWorld(vehicleId: number, pos: THREE.Vector3, normal: THREE.Vector3, vehicleSurfaceOffset: number): void {
    const mesh = this.vehicleMeshes.get(vehicleId)
    if (!mesh) return
    mesh.quaternion.setFromUnitVectors(UP, normal)
    mesh.position.copy(pos).addScaledVector(normal, vehicleSurfaceOffset)
  }

  placeCrate(crateId: number, tileId: number, tileApi: TileCentersApi, globeCenter: THREE.Vector3): void {
    const mesh = this.crateMeshes.get(crateId)
    if (!mesh) return
    // Detach from vehicle parent if needed
    this.detachCrateFromVehicle(crateId)
    const wp = tileWorldPos(tileId, tileApi, globeCenter)
    if (!wp) return
    mesh.quaternion.setFromUnitVectors(UP, wp.normal)
    mesh.position.copy(wp.pos)
  }

  attachCrateToVehicle(crateId: number, vehicleId: number, slotIndex: number): void {
    const crate = this.crateMeshes.get(crateId)
    const vehicle = this.vehicleMeshes.get(vehicleId)
    if (!crate || !vehicle) return
    this.detachCrateFromVehicle(crateId)
    vehicle.add(crate)
    // Position in vehicle-local space, stacked above
    crate.position.set(0, CRATE_ON_VEHICLE_OFFSET * (slotIndex + 1), 0)
    crate.quaternion.identity()
    this.crateVehicle.set(crateId, vehicleId)
  }

  detachCrateFromVehicle(crateId: number): void {
    const crate = this.crateMeshes.get(crateId)
    if (!crate) return
    if (crate.parent && crate.parent !== this.scene) {
      // Convert world position before reparenting
      const worldPos = new THREE.Vector3()
      crate.getWorldPosition(worldPos)
      this.scene.attach(crate)
      crate.position.copy(worldPos)
    }
    this.crateVehicle.delete(crateId)
  }

  destroyCrate(crateId: number): void {
    const mesh = this.crateMeshes.get(crateId)
    if (!mesh) return
    this.detachCrateFromVehicle(crateId)
    this.scene.remove(mesh)
    const idx = this.objects.indexOf(mesh)
    if (idx !== -1) this.objects.splice(idx, 1)
    this.crateMeshes.delete(crateId)
  }

  dispose(): void {
    for (const obj of this.objects) {
      this.scene.remove(obj)
    }
    this.objects = []
    this.vehicleMeshes.clear()
    this.crateMeshes.clear()
    this.crateVehicle.clear()
  }

  private loadGltf(url: string): Promise<GLTF> {
    const cached = this.gltfCache.get(url)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => { this.gltfCache.set(url, gltf); resolve(gltf) }, undefined, reject)
    })
  }
}
