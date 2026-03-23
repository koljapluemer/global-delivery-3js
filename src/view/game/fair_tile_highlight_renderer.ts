import * as THREE from 'three'
import type { TileCentersApi, TileCenter } from '../../controller/layer_0/tile_centers_api'

const POINT_SIZE = 0.025
const SURFACE_OFFSET = 0.012

export class FairTileHighlightRenderer {
  private readonly scene: THREE.Scene
  private readonly globeCenter: THREE.Vector3
  private points: THREE.Points | null = null

  constructor(scene: THREE.Scene, globeCenter: THREE.Vector3) {
    this.scene = scene
    this.globeCenter = globeCenter.clone()
  }

  /** Show green highlight dots for all tiles in tileIds. */
  show(tileIds: ReadonlySet<number>, tileApi: TileCentersApi): void {
    this.hide()
    const tiles: TileCenter[] = []
    for (const id of tileIds) {
      const tile = tileApi.getTileById(id)
      if (tile) tiles.push(tile)
    }
    if (tiles.length === 0) return

    this.points = this.buildPoints(tiles)
    this.scene.add(this.points)
  }

  /** Remove highlight dots. No-op if not shown. */
  hide(): void {
    if (this.points) {
      this.scene.remove(this.points)
      this.points.geometry.dispose()
      ;(this.points.material as THREE.Material).dispose()
      this.points = null
    }
  }

  private buildPoints(tiles: readonly TileCenter[]): THREE.Points {
    const positions = new Float32Array(tiles.length * 3)
    for (let i = 0; i < tiles.length; i++) {
      const wx = tiles[i].x
      const wy = tiles[i].z
      const wz = -tiles[i].y
      const nx = wx - this.globeCenter.x
      const ny = wy - this.globeCenter.y
      const nz = wz - this.globeCenter.z
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      positions[i * 3]     = wx + (nx / len) * SURFACE_OFFSET
      positions[i * 3 + 1] = wy + (ny / len) * SURFACE_OFFSET
      positions[i * 3 + 2] = wz + (nz / len) * SURFACE_OFFSET
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      size: POINT_SIZE,
      sizeAttenuation: true,
      color: 0x44ff88,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })

    return new THREE.Points(geometry, material)
  }
}
