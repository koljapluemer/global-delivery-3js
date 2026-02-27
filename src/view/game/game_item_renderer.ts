import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GameItemStateManager } from '../../controller/layer_1/game_item_state_manager'
import type { TileCentersApi } from '../../controller/layer_0/tile_centers_api'
import crateUrl from '../../assets/items/crate.glb?url'

/** Uniform scale applied to each crate model. */
const CRATE_SCALE = 0.01
/** How far to push each crate along the tile's outward surface normal, in world units. */
const CRATE_SURFACE_OFFSET = 0

const UP = new THREE.Vector3(0, 1, 0)

export class GameItemRenderer {
  private crates: THREE.Object3D[] = []

  constructor(private readonly scene: THREE.Scene) {}

  async render(
    stateManager: GameItemStateManager,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
    stepIndex = 0
  ): Promise<void> {
    const timestep = stateManager.getStepAtIndex(stepIndex)
    const gltf = await this.loadGltf()

    for (const [tileIdStr, crate] of Object.entries(timestep)) {
      const tile = tileApi.getTileById(Number(tileIdStr))
      if (!tile) continue

      // Apply Z-up → Y-up remap (same convention as tile_centers_renderer)
      const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
      const outwardNormal = tilePos.clone().sub(globeCenter).normalize()

      const crateObj = gltf.scene.clone()
      crateObj.scale.setScalar(CRATE_SCALE)

      // Orient so the crate's +Y axis faces outward from the globe surface
      crateObj.quaternion.setFromUnitVectors(UP, outwardNormal)

      // Place at tile position + surface offset along the normal
      crateObj.position
        .copy(tilePos)
        .addScaledVector(outwardNormal, CRATE_SURFACE_OFFSET)

      if (crate.isGhost) {
        crateObj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // Clone material so ghost state doesn't bleed into the shared asset
            child.material = (child.material as THREE.Material).clone()
            ;(child.material as THREE.MeshStandardMaterial).transparent = true
            ;(child.material as THREE.MeshStandardMaterial).opacity = 0.4
          }
        })
      }

      this.scene.add(crateObj)
      this.crates.push(crateObj)
    }
  }

  dispose(): void {
    for (const crate of this.crates) {
      this.scene.remove(crate)
    }
    this.crates = []
  }

  private loadGltf(): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(crateUrl, resolve, undefined, reject)
    })
  }
}
