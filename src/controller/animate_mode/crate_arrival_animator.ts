import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { TileCentersApi } from '../layer_0/tile_centers_api'
import crateUrl from '../../assets/items/crate.glb?url'

const CRATE_SCALE = 0.004
/** Seconds to wait for camera pan before the crate starts appearing. */
const PAN_WAIT_S = 0.5
/** Seconds for the scale-up appearance animation. */
const APPEAR_S = 0.5

const LOCAL_Y = new THREE.Vector3(0, 1, 0)

/** Easing with slight overshoot (easeOutBack). */
function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/**
 * Animates a new crate appearing on the globe surface after the camera pans to it.
 * Driven by tick() calls from the render loop (same pattern as PlanAnimator).
 */
export class CrateArrivalAnimator {
  private tickResolve: (() => void) | null = null
  private accumulatedDelta = 0
  private mesh: THREE.Object3D | null = null
  private scene: THREE.Scene | null = null

  tick(delta: number): void {
    this.accumulatedDelta += delta
    this.tickResolve?.()
  }

  private waitSeconds(seconds: number): Promise<void> {
    const target = this.accumulatedDelta + seconds
    return new Promise((resolve) => {
      const check = () => {
        if (this.accumulatedDelta >= target) {
          this.tickResolve = null
          resolve()
        } else {
          this.tickResolve = check
        }
      }
      this.tickResolve = check
    })
  }

  async run(
    tileId: number,
    globeCenter: THREE.Vector3,
    tileApi: TileCentersApi,
    scene: THREE.Scene,
  ): Promise<void> {
    this.scene = scene

    const tile = tileApi.getTileById(tileId)
    if (!tile) return

    const pos = new THREE.Vector3(tile.x, tile.z, -tile.y)
    const normal = pos.clone().sub(globeCenter).normalize()

    // Load the crate model and wait for pan in parallel
    const [gltf] = await Promise.all([
      new Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>((resolve, reject) => {
        new GLTFLoader().load(crateUrl, resolve, undefined, reject)
      }),
      this.waitSeconds(PAN_WAIT_S),
    ])

    const obj = gltf.scene.clone()
    obj.scale.setScalar(0)
    obj.quaternion.setFromUnitVectors(LOCAL_Y, normal)
    obj.position.copy(pos)
    scene.add(obj)
    this.mesh = obj

    // Animate scale from 0 to 1 with overshoot
    const startTime = this.accumulatedDelta
    const endTime = startTime + APPEAR_S

    while (this.accumulatedDelta < endTime) {
      const t = Math.min(1, (this.accumulatedDelta - startTime) / APPEAR_S)
      obj.scale.setScalar(CRATE_SCALE * easeOutBack(t))
      await this.waitSeconds(0)
    }

    obj.scale.setScalar(CRATE_SCALE)
  }

  dispose(): void {
    if (this.mesh && this.scene) {
      this.scene.remove(this.mesh)
    }
    this.mesh = null
    this.scene = null
  }
}
