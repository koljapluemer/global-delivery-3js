import * as THREE from 'three'
import type { TileCentersApi, TileCenter } from './tile_centers_api'

export type TileHoverCallback = (tile: TileCenter | null) => void

export class GlobePointer {
  onHover: TileHoverCallback = () => {}

  private readonly raycaster = new THREE.Raycaster()
  private readonly mouse = new THREE.Vector2()
  private readonly sphereCenter: THREE.Vector3
  private readonly sphereRadius: number
  private readonly tiles: readonly TileCenter[]

  constructor(
    canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    api: TileCentersApi,
    boundingSphere: THREE.Sphere
  ) {
    this.sphereCenter = boundingSphere.center.clone()
    this.sphereRadius = boundingSphere.radius
    this.tiles = api.getAll()

    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e, canvas))
  }

  private onMouseMove(e: MouseEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    this.mouse.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )

    const hit = this.raySphereIntersect()
    this.onHover(hit ? this.nearestTile(hit) : null)
  }

  /** Mathematical ray-sphere intersection — no scene object required. */
  private raySphereIntersect(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const { origin, direction } = this.raycaster.ray
    const oc = origin.clone().sub(this.sphereCenter)
    const b = 2 * oc.dot(direction)
    const c = oc.dot(oc) - this.sphereRadius * this.sphereRadius
    const discriminant = b * b - 4 * c  // a=1 since direction is normalised
    if (discriminant < 0) return null
    const t = (-b - Math.sqrt(discriminant)) / 2
    if (t < 0) return null
    return origin.clone().addScaledVector(direction, t)
  }

  /** Returns the tile whose center direction is closest to the hit point. */
  private nearestTile(hit: THREE.Vector3): TileCenter {
    // Normalise hit point into a unit direction for dot-product comparison.
    const h = hit.clone().sub(this.sphereCenter).normalize()

    let best = this.tiles[0]
    let bestDot = -Infinity

    for (const tile of this.tiles) {
      // Apply same Z-up → Y-up remap as the renderer: (x, y, z) → (x, z, -y)
      const tx = tile.x, ty = tile.z, tz = -tile.y
      const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz)
      const dot = (h.x * tx + h.y * ty + h.z * tz) / tLen
      if (dot > bestDot) {
        bestDot = dot
        best = tile
      }
    }

    return best
  }
}
