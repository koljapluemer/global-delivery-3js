import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GameItemStateManager } from '../../controller/layer_1/game_item_state_manager'
import type { TileCentersApi } from '../../controller/layer_0/tile_centers_api'
import crateUrl from '../../assets/items/crate.glb?url'
import carUrl from '../../assets/items/vehicles/car.glb?url'
import boatUrl from '../../assets/items/vehicles/boat.glb?url'

/** Uniform scale applied to each crate model. */
const CRATE_SCALE = 0.01
/** How far to push each crate along the tile's outward surface normal, in world units. */
const CRATE_SURFACE_OFFSET = 0

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
    const timestep = stateManager.getStepAtIndex(stepIndex)

    for (const [tileIdStr, occupant] of Object.entries(timestep)) {
      const tile = tileApi.getTileById(Number(tileIdStr))
      if (!tile) continue

      // Apply Z-up → Y-up remap (same convention as tile_centers_renderer)
      const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
      const outwardNormal = tilePos.clone().sub(globeCenter).normalize()

      if (occupant.kind === 'Crate') {
        const gltf = await this.loadGltf(crateUrl)
        const obj = gltf.scene.clone()
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

        const gltf = await this.loadGltf(url)
        const obj = gltf.scene.clone()
        obj.scale.setScalar(vehicleType.scale)
        obj.quaternion.setFromUnitVectors(UP, outwardNormal)
        obj.position.copy(tilePos).addScaledVector(outwardNormal, vehicleType.offsetAlongNormal)

        this.scene.add(obj)
        this.objects.push(obj)
      }
    }
  }

  dispose(): void {
    for (const obj of this.objects) {
      this.scene.remove(obj)
    }
    this.objects = []
  }

  private loadGltf(url: string): Promise<GLTF> {
    const cached = this.gltfCache.get(url)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(
        url,
        (gltf) => {
          this.gltfCache.set(url, gltf)
          resolve(gltf)
        },
        undefined,
        reject
      )
    })
  }
}
