import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GameItemStateManager } from '../../controller/layer_1/game_item_state_manager'
import type { TileCentersApi } from '../../controller/layer_0/tile_centers_api'
import type { NavApi } from '../../controller/navigation'
import type { Plan, Timestep } from '../../model/types/Plan'
import type { Crate } from '../../model/types/Crate'
import type { Vehicle } from '../../model/types/Vehicle'
import { hsvColor, applyPrimaryColor } from './color_utils'
import crateUrl from '../../assets/items/crate.glb?url'
import carUrl from '../../assets/items/vehicles/car.glb?url'
import boatUrl from '../../assets/items/vehicles/boat.glb?url'
import pinUrl from '../../assets/ui/pin.glb?url'
import roundedArrowUrl from '../../assets/ui/rounded_arrow.glb?url'

/** Uniform scale applied to each crate model. */
const CRATE_SCALE = 0.004
/** How far to push each crate along the tile's outward surface normal, in world units. */
const CRATE_SURFACE_OFFSET = 0

/** Scale applied to each vehicle-movement pin. */
const PIN_SCALE = 0.02
/** How far to push each pin along the outward surface normal, in world units. */
const PIN_SURFACE_OFFSET = -0.02

/** How far to push route path lines above the surface, in world units. */
const PATH_LINE_SURFACE_OFFSET = 0.0

/** Uniform scale applied to each cargo-loading arrow. */
const CARGO_ARROW_SCALE = 0.035
/** How far to push cargo arrows along the tile's outward surface normal, in world units. */
const CARGO_ARROW_SURFACE_OFFSET = 0.005

/** Opacity for ghost crates rendered at unloading destinations. */
const GHOST_CRATE_OPACITY = 0.1

const UP = new THREE.Vector3(0, 1, 0)

/** Maps VehicleType.meshPath values to their Vite-resolved asset URLs. */
const VEHICLE_MESH_URLS: Record<string, string> = {
  'assets/items/vehicles/car.glb': carUrl,
  'assets/items/vehicles/boat.glb': boatUrl,
}

export class GameItemRenderer {
  private readonly scene: THREE.Scene
  private readonly navApi: NavApi
  private objects: THREE.Object3D[] = []
  private pickables: THREE.Object3D[] = []
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
    await this.renderCargoLoadingArrows(plan, tileApi, globeCenter)
    await this.renderCargoUnloadingEffects(plan, tileApi, globeCenter)
  }

  dispose(): void {
    for (const obj of this.objects) {
      this.scene.remove(obj)
    }
    this.objects = []
    this.pickables = []
  }

  getPickableObjects(): readonly THREE.Object3D[] {
    return this.pickables
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
        const crateMeta = { entityType: 'CRATE', entityId: id }
        obj.userData = crateMeta
        obj.traverse((child) => { child.userData = crateMeta })

        this.scene.add(obj)
        this.objects.push(obj)
        this.pickables.push(obj)
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
        const vehicleMeta = { entityType: 'VEHICLE', entityId: id }
        obj.userData = vehicleMeta
        obj.traverse((child) => { child.userData = vehicleMeta })

        this.scene.add(obj)
        this.objects.push(obj)
        this.pickables.push(obj)
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

  /**
   * Each timestep represents end-of-step state. A crate is loaded in step i when it appears
   * in step[i].transportedCargo but was absent from step[i-1].transportedCargo.
   * Place a rounded_arrow.glb at the crate's tile in step[i-1] (last known position),
   * pointing toward the vehicle's tile in step[i] (where it is after loading).
   */
  private async renderCargoLoadingArrows(
    plan: Plan,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3
  ): Promise<void> {
    const { steps } = plan
    for (let i = 1; i < steps.length; i++) {
      const prevStep = steps[i - 1]
      const currStep = steps[i]

      // Build crateId → tileId from the previous step (crate's last known position)
      const crateTileInPrev = new Map<number, number>()
      for (const [tileIdStr, occupant] of Object.entries(prevStep.tileOccupations)) {
        if (occupant[0] === 'CRATE') {
          crateTileInPrev.set(occupant[1], Number(tileIdStr))
        }
      }

      // Build vehicleId → tileId from the current step (where vehicle is after loading)
      const vehicleTileInCurr = new Map<number, number>()
      for (const [tileIdStr, occupant] of Object.entries(currStep.tileOccupations)) {
        if (occupant[0] === 'VEHICLE') {
          vehicleTileInCurr.set(occupant[1], Number(tileIdStr))
        }
      }

      // Only show arrows for crates newly loaded this step
      const alreadyTransported = new Set<number>(Object.keys(prevStep.transportedCargo).map(Number))

      for (const [crateIdStr, vehicleId] of Object.entries(currStep.transportedCargo)) {
        const crateId = Number(crateIdStr)
        if (alreadyTransported.has(crateId)) continue   // loaded in an earlier step
        const crateTileId = crateTileInPrev.get(crateId)
        if (crateTileId === undefined) continue          // no known previous tile position
        const vehicleTileId = vehicleTileInCurr.get(vehicleId)
        if (vehicleTileId === undefined) continue        // vehicle not visible in currStep

        const vehicle = plan.vehicles[vehicleId]
        if (!vehicle) continue

        const crateTile = tileApi.getTileById(crateTileId)   // from prevStep
        const vehicleTile = tileApi.getTileById(vehicleTileId) // from currStep
        if (!crateTile || !vehicleTile) continue

        const cratePos = new THREE.Vector3(crateTile.x, crateTile.z, -crateTile.y)
        const vehiclePos = new THREE.Vector3(vehicleTile.x, vehicleTile.z, -vehicleTile.y)
        // The arrow points along its local Z+. Map globe outward normal → model Y+ (lies flat),
        // and toward-vehicle (tangent) → model Z+ (arrow direction).
        const yAxis = cratePos.clone().sub(globeCenter).normalize()

        const toVehicle = vehiclePos.clone().sub(cratePos)
        const zAxis = toVehicle.clone().sub(yAxis.clone().multiplyScalar(toVehicle.dot(yAxis))).normalize()
        const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis)

        const arrow = (await this.loadGltf(roundedArrowUrl)).scene.clone()
        arrow.scale.setScalar(CARGO_ARROW_SCALE)
        arrow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis))
        arrow.position.copy(cratePos).addScaledVector(yAxis, CARGO_ARROW_SURFACE_OFFSET)
        applyPrimaryColor(arrow, hsvColor(vehicle.hue))
        this.scene.add(arrow)
        this.objects.push(arrow)
      }
    }
  }

  /**
   * A crate is unloaded in step i when it was in step[i-1].transportedCargo but absent
   * from step[i].transportedCargo and present in step[i].tileOccupations.
   * Place a rounded_arrow.glb at the vehicle's tile in step[i], pointing toward the crate's
   * tile in step[i]. Also place a semi-transparent ghost crate at that tile.
   */
  private async renderCargoUnloadingEffects(
    plan: Plan,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3
  ): Promise<void> {
    const { steps } = plan
    for (let i = 1; i < steps.length; i++) {
      const prevStep = steps[i - 1]
      const currStep = steps[i]

      // Build crateId → tileId from currStep (where the crate landed after unloading)
      const crateTileInCurr = new Map<number, number>()
      for (const [tileIdStr, occupant] of Object.entries(currStep.tileOccupations)) {
        if (occupant[0] === 'CRATE') {
          crateTileInCurr.set(occupant[1], Number(tileIdStr))
        }
      }

      // Build vehicleId → tileId from currStep
      const vehicleTileInCurr = new Map<number, number>()
      for (const [tileIdStr, occupant] of Object.entries(currStep.tileOccupations)) {
        if (occupant[0] === 'VEHICLE') {
          vehicleTileInCurr.set(occupant[1], Number(tileIdStr))
        }
      }

      // Find crates that were transported in prevStep but not in currStep
      for (const [crateIdStr, vehicleId] of Object.entries(prevStep.transportedCargo)) {
        const crateId = Number(crateIdStr)
        if (crateId in currStep.transportedCargo) continue  // still being carried
        const crateTileId = crateTileInCurr.get(crateId)
        if (crateTileId === undefined) continue              // not on tiles in currStep either
        const vehicleTileId = vehicleTileInCurr.get(vehicleId)
        if (vehicleTileId === undefined) continue            // vehicle not visible in currStep

        const vehicle = plan.vehicles[vehicleId]
        if (!vehicle) continue

        const crateTile = tileApi.getTileById(crateTileId)
        const vehicleTile = tileApi.getTileById(vehicleTileId)
        if (!crateTile || !vehicleTile) continue

        const cratePos = new THREE.Vector3(crateTile.x, crateTile.z, -crateTile.y)
        const vehiclePos = new THREE.Vector3(vehicleTile.x, vehicleTile.z, -vehicleTile.y)

        // Arrow at vehicle's tile pointing toward crate's tile (Z+ = pointing direction)
        const yAxis = vehiclePos.clone().sub(globeCenter).normalize()
        const toCrate = cratePos.clone().sub(vehiclePos)
        const zAxis = toCrate.clone().sub(yAxis.clone().multiplyScalar(toCrate.dot(yAxis))).normalize()
        const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis)

        const arrow = (await this.loadGltf(roundedArrowUrl)).scene.clone()
        arrow.scale.setScalar(CARGO_ARROW_SCALE)
        arrow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis))
        arrow.position.copy(vehiclePos).addScaledVector(yAxis, CARGO_ARROW_SURFACE_OFFSET)
        applyPrimaryColor(arrow, hsvColor(vehicle.hue))
        this.scene.add(arrow)
        this.objects.push(arrow)

        // Ghost crate at the unloaded tile
        const crateOutwardNormal = cratePos.clone().sub(globeCenter).normalize()
        const ghost = (await this.loadGltf(crateUrl)).scene.clone()
        ghost.scale.setScalar(CRATE_SCALE)
        ghost.quaternion.setFromUnitVectors(UP, crateOutwardNormal)
        ghost.position.copy(cratePos).addScaledVector(crateOutwardNormal, CRATE_SURFACE_OFFSET)
        ghost.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          const applyOpacity = (mat: THREE.Material) => {
            const cloned = (mat as THREE.MeshStandardMaterial).clone()
            cloned.transparent = true
            cloned.opacity = GHOST_CRATE_OPACITY
            return cloned
          }
          if (Array.isArray(child.material)) {
            child.material = child.material.map(applyOpacity)
          } else {
            child.material = applyOpacity(child.material)
          }
        })
        this.scene.add(ghost)
        this.objects.push(ghost)
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
