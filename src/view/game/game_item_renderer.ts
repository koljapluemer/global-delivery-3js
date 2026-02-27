import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GameItemStateManager } from '../../controller/layer_1/game_item_state_manager'
import type { TileCentersApi } from '../../controller/layer_0/tile_centers_api'
import type { NavApi } from '../../controller/navigation'
import type { Plan, Timestep } from '../../model/types/Plan'
import type { Crate } from '../../model/types/Crate'
import type { Vehicle } from '../../model/types/Vehicle'
import crateUrl from '../../assets/items/crate.glb?url'
import carUrl from '../../assets/items/vehicles/car.glb?url'
import boatUrl from '../../assets/items/vehicles/boat.glb?url'
import pinUrl from '../../assets/ui/pin.glb?url'

/** Uniform scale applied to each crate model. */
const CRATE_SCALE = 0.01
/** How far to push each crate along the tile's outward surface normal, in world units. */
const CRATE_SURFACE_OFFSET = 0

/** Scale applied to each vehicle-movement pin. */
const PIN_SCALE = 0.02
/** How far to push each pin along the outward surface normal, in world units. */
const PIN_SURFACE_OFFSET = -0.02

/** How far to push route path lines above the surface, in world units. */
const PATH_LINE_SURFACE_OFFSET = 0.0

const UP = new THREE.Vector3(0, 1, 0)

/**
 * Convert a hue (0–360) with fixed S=60, V=60 (0–100 scale) to a Three.js Color.
 * Uses HSV→HSL conversion since Three.js only exposes setHSL.
 */
function hsvColor(hue: number): THREE.Color {
  const s = 0.8, v = 0.8
  const l = v * (1 - s / 2)
  const sl = (l === 0 || l === 1) ? 0 : (v - l) / Math.min(l, 1 - l)
  return new THREE.Color().setHSL(hue / 360, sl, l)
}

/**
 * Finds every mesh in `obj` whose material (or one of its materials) is named
 * "PrimaryMaterial", clones that material, and overwrites its color.
 * Cloning is required because GLB clones share the original material instances.
 */
function applyPrimaryColor(obj: THREE.Object3D, color: THREE.Color): void {
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (Array.isArray(child.material)) {
      child.material = child.material.map((mat: THREE.Material) => {
        if (mat.name !== 'PrimaryMaterial') return mat
        const cloned = (mat as THREE.MeshStandardMaterial).clone()
        cloned.color.copy(color)
        return cloned
      })
    } else {
      const mat = child.material as THREE.MeshStandardMaterial
      if (mat.name !== 'PrimaryMaterial') return
      child.material = mat.clone()
      ;(child.material as THREE.MeshStandardMaterial).color.copy(color)
    }
  })
}

/** Maps VehicleType.meshPath values to their Vite-resolved asset URLs. */
const VEHICLE_MESH_URLS: Record<string, string> = {
  'assets/items/vehicles/car.glb': carUrl,
  'assets/items/vehicles/boat.glb': boatUrl,
}

export class GameItemRenderer {
  private readonly scene: THREE.Scene
  private readonly navApi: NavApi
  private objects: THREE.Object3D[] = []
  private gltfCache = new Map<string, GLTF>()

  constructor(scene: THREE.Scene, navApi: NavApi) {
    this.scene = scene
    this.navApi = navApi
  }

  async render(
    stateManager: GameItemStateManager,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
    stepIndex = 0
  ): Promise<void> {
    const plan = stateManager.getPlan()
    await this.renderTimestep(plan.steps[stepIndex], plan.crates, plan.vehicles, tileApi, globeCenter)
    await this.renderVehicleMovementPins(plan, tileApi, globeCenter)
  }

  dispose(): void {
    for (const obj of this.objects) {
      this.scene.remove(obj)
    }
    this.objects = []
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async renderTimestep(
    timestep: Timestep,
    crates: Record<number, Crate>,
    vehicles: Record<number, Vehicle>,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3
  ): Promise<void> {
    for (const [tileIdStr, occupant] of Object.entries(timestep.tileOccupations)) {
      const tile = tileApi.getTileById(Number(tileIdStr))
      if (!tile) continue

      // Apply Z-up → Y-up remap (same convention used throughout the codebase)
      const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
      const outwardNormal = tilePos.clone().sub(globeCenter).normalize()
      const [kind, id] = occupant

      if (kind === 'CRATE') {
        const crate = crates[id]
        if (!crate) continue

        const obj = (await this.loadGltf(crateUrl)).scene.clone()
        obj.scale.setScalar(CRATE_SCALE)
        obj.quaternion.setFromUnitVectors(UP, outwardNormal)
        obj.position.copy(tilePos).addScaledVector(outwardNormal, CRATE_SURFACE_OFFSET)

        this.scene.add(obj)
        this.objects.push(obj)
      } else if (kind === 'VEHICLE') {
        const vehicle = vehicles[id]
        if (!vehicle) {
          console.warn(`GameItemRenderer: no vehicle data for id ${id}`)
          continue
        }
        const { vehicleType } = vehicle
        const url = VEHICLE_MESH_URLS[vehicleType.meshPath]
        if (!url) {
          console.warn(`GameItemRenderer: no URL mapping for vehicle mesh "${vehicleType.meshPath}"`)
          continue
        }

        const obj = (await this.loadGltf(url)).scene.clone()
        obj.scale.setScalar(vehicleType.scale)
        obj.quaternion.setFromUnitVectors(UP, outwardNormal)
        obj.position.copy(tilePos).addScaledVector(outwardNormal, vehicleType.offsetAlongNormal)
        applyPrimaryColor(obj, hsvColor(vehicle.hue))

        this.scene.add(obj)
        this.objects.push(obj)
      }
    }
  }

  /**
   * For every consecutive step pair in the plan, place a pin at each tile where
   * a vehicle ends up after moving (i.e. its tile ID changed since the previous step).
   */
  private async renderVehicleMovementPins(
    plan: Plan,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3
  ): Promise<void> {
    const { steps, vehicles } = plan
    for (let i = 1; i < steps.length; i++) {
      const prevStep = steps[i - 1]
      const currStep = steps[i]

      // Build vehicleId → tileId map for the previous step
      const prevTileByVehicleId = new Map<number, number>()
      for (const [tileIdStr, occupant] of Object.entries(prevStep.tileOccupations)) {
        if (occupant[0] === 'VEHICLE') {
          prevTileByVehicleId.set(occupant[1], Number(tileIdStr))
        }
      }

      // Find vehicles that are now on a different tile, place a pin and draw route line
      for (const [tileIdStr, occupant] of Object.entries(currStep.tileOccupations)) {
        if (occupant[0] !== 'VEHICLE') continue
        const tileId = Number(tileIdStr)
        const id = occupant[1]
        const prevTileId = prevTileByVehicleId.get(id)
        if (prevTileId === tileId) continue // didn't move

        const tile = tileApi.getTileById(tileId)
        if (!tile) continue

        const vehicle = vehicles[id]
        if (!vehicle) continue
        const { vehicleType } = vehicle
        const color = hsvColor(vehicle.hue)

        const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
        const outwardNormal = tilePos.clone().sub(globeCenter).normalize()

        // Pin at destination
        const pin = (await this.loadGltf(pinUrl)).scene.clone()
        pin.scale.setScalar(PIN_SCALE)
        pin.quaternion.setFromUnitVectors(UP, outwardNormal)
        pin.position.copy(tilePos).addScaledVector(outwardNormal, PIN_SURFACE_OFFSET)
        applyPrimaryColor(pin, color)
        this.scene.add(pin)
        this.objects.push(pin)

        // Route line from previous tile to this tile
        if (prevTileId !== undefined) {
          const path = this.navApi.findPath(prevTileId, tileId, vehicleType.navMesh)
          if (path && path.length > 1) {
            this.drawRouteLine(path, tileApi, globeCenter, vehicleType.offsetAlongNormal, color)
          }
        }
      }
    }
  }

  private drawRouteLine(
    pathTileIds: number[],
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
    vehicleSurfaceOffset: number,
    color: THREE.Color,
  ): void {
    const surfaceOffset = vehicleSurfaceOffset + PATH_LINE_SURFACE_OFFSET
    const points: THREE.Vector3[] = []
    for (const tileId of pathTileIds) {
      const tile = tileApi.getTileById(tileId)
      if (!tile) continue
      const pos = new THREE.Vector3(tile.x, tile.z, -tile.y)
      const normal = pos.clone().sub(globeCenter).normalize()
      points.push(pos.clone().addScaledVector(normal, surfaceOffset))
    }
    if (points.length < 2) return

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ color })
    const line = new THREE.Line(geometry, material)
    this.scene.add(line)
    this.objects.push(line)
  }

  private loadGltf(url: string): Promise<GLTF> {
    const cached = this.gltfCache.get(url)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => { this.gltfCache.set(url, gltf); resolve(gltf) }, undefined, reject)
    })
  }
}
