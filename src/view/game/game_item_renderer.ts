import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GameItemStateManager } from '../../controller/layer_1/game_item_state_manager'
import type { TileCentersApi } from '../../controller/layer_0/tile_centers_api'
import type { Plan } from '../../model/types/Plan'
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

const UP = new THREE.Vector3(0, 1, 0)

/** Maps VehicleType.meshPath values to their Vite-resolved asset URLs. */
const VEHICLE_MESH_URLS: Record<string, string> = {
  'assets/items/vehicles/car.glb': carUrl,
  'assets/items/vehicles/boat.glb': boatUrl,
}

export class GameItemRenderer {
  private objects: THREE.Object3D[] = []
  private gltfCache = new Map<string, GLTF>()

  constructor(private readonly scene: THREE.Scene) {}

  async render(
    stateManager: GameItemStateManager,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
    stepIndex = 0
  ): Promise<void> {
    await this.renderTimestep(stateManager.getStepAtIndex(stepIndex), tileApi, globeCenter)
    await this.renderVehicleMovementPins(stateManager.getPlan(), tileApi, globeCenter)
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
    timestep: ReturnType<GameItemStateManager['getStepAtIndex']>,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3
  ): Promise<void> {
    for (const [tileIdStr, occupant] of Object.entries(timestep)) {
      const tile = tileApi.getTileById(Number(tileIdStr))
      if (!tile) continue

      // Apply Z-up → Y-up remap (same convention used throughout the codebase)
      const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
      const outwardNormal = tilePos.clone().sub(globeCenter).normalize()

      if (occupant.kind === 'Crate') {
        const obj = (await this.loadGltf(crateUrl)).scene.clone()
        obj.scale.setScalar(CRATE_SCALE)
        obj.quaternion.setFromUnitVectors(UP, outwardNormal)
        obj.position.copy(tilePos).addScaledVector(outwardNormal, CRATE_SURFACE_OFFSET)

        if (occupant.isGhost) {
          obj.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = (child.material as THREE.Material).clone()
              ;(child.material as THREE.MeshStandardMaterial).transparent = true
              ;(child.material as THREE.MeshStandardMaterial).opacity = 0.4
            }
          })
        }

        this.scene.add(obj)
        this.objects.push(obj)
      } else if (occupant.kind === 'Vehicle') {
        const { vehicleType } = occupant
        const url = VEHICLE_MESH_URLS[vehicleType.meshPath]
        if (!url) {
          console.warn(`GameItemRenderer: no URL mapping for vehicle mesh "${vehicleType.meshPath}"`)
          continue
        }

        const obj = (await this.loadGltf(url)).scene.clone()
        obj.scale.setScalar(vehicleType.scale)
        obj.quaternion.setFromUnitVectors(UP, outwardNormal)
        obj.position.copy(tilePos).addScaledVector(outwardNormal, vehicleType.offsetAlongNormal)

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
    const { steps } = plan
    for (let i = 1; i < steps.length; i++) {
      const prevStep = steps[i - 1]
      const currStep = steps[i]

      // Build vehicleId → tileId map for the previous step
      const prevTileByVehicleId = new Map<number, number>()
      for (const [tileIdStr, occupant] of Object.entries(prevStep)) {
        if (occupant.kind === 'Vehicle') {
          prevTileByVehicleId.set(occupant.id, Number(tileIdStr))
        }
      }

      // Find vehicles that are now on a different tile and place a pin there
      for (const [tileIdStr, occupant] of Object.entries(currStep)) {
        if (occupant.kind !== 'Vehicle') continue
        const tileId = Number(tileIdStr)
        if (prevTileByVehicleId.get(occupant.id) === tileId) continue // didn't move

        const tile = tileApi.getTileById(tileId)
        if (!tile) continue

        const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
        const outwardNormal = tilePos.clone().sub(globeCenter).normalize()

        const pin = (await this.loadGltf(pinUrl)).scene.clone()
        pin.scale.setScalar(PIN_SCALE)
        pin.quaternion.setFromUnitVectors(UP, outwardNormal)
        pin.position.copy(tilePos).addScaledVector(outwardNormal, PIN_SURFACE_OFFSET)

        this.scene.add(pin)
        this.objects.push(pin)
      }
    }
  }

  private loadGltf(url: string): Promise<GLTF> {
    const cached = this.gltfCache.get(url)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => { this.gltfCache.set(url, gltf); resolve(gltf) }, undefined, reject)
    })
  }
}
