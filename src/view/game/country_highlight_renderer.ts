import * as THREE from 'three'
import type { TileCentersApi, TileCenter } from '../../controller/layer_0/tile_centers_api'

const POINT_SIZE = 0.018
const SURFACE_OFFSET = 0.002

function makeCircleTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
  ctx.fillStyle = 'white'
  ctx.fill()
  return new THREE.CanvasTexture(canvas)
}

export class CountryHighlightRenderer {
  private readonly scene: THREE.Scene
  private readonly globeCenter: THREE.Vector3
  private points: THREE.Points | null = null

  constructor(scene: THREE.Scene, globeCenter: THREE.Vector3) {
    this.scene = scene
    this.globeCenter = globeCenter.clone()
  }

  /**
   * Show highlight dots for all tiles of countryName.
   * Returns the world position of the tile most facing the camera (for panTo), or null if no tiles.
   */
  show(countryName: string, tileApi: TileCentersApi, cameraPosition: THREE.Vector3): THREE.Vector3 | null {
    this.hide()
    const tiles = tileApi.getByCountryName(countryName)
    if (tiles.length === 0) return null

    this.points = this.buildPoints(tiles)
    this.scene.add(this.points)

    return this.findNearestTile(tiles, cameraPosition)
  }

  /** Remove highlight dots. No-op if not shown. */
  hide(): void {
    if (this.points) {
      this.scene.remove(this.points)
      this.points.geometry.dispose()
      const mat = this.points.material as THREE.PointsMaterial
      mat.map?.dispose()
      mat.dispose()
      this.points = null
    }
  }

  private buildPoints(tiles: readonly TileCenter[]): THREE.Points {
    const positions = new Float32Array(tiles.length * 3)
    for (let i = 0; i < tiles.length; i++) {
      // Tile world position convention (matches label_renderer.ts): x, z, -y
      const wx = tiles[i].x
      const wy = tiles[i].z
      const wz = -tiles[i].y
      // Offset slightly outward from globe center along tile normal
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
      color: 0xffffff,
      map: makeCircleTexture(),
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      alphaTest: 0.1,
    })

    return new THREE.Points(geometry, material)
  }

  private findNearestTile(tiles: readonly TileCenter[], cameraPosition: THREE.Vector3): THREE.Vector3 | null {
    if (tiles.length === 0) return null
    // Camera direction from globe center
    const camDir = cameraPosition.clone().sub(this.globeCenter).normalize()

    let bestDot = -Infinity
    let bestTile: TileCenter | null = null
    for (const tile of tiles) {
      const wx = tile.x
      const wy = tile.z
      const wz = -tile.y
      const nx = wx - this.globeCenter.x
      const ny = wy - this.globeCenter.y
      const nz = wz - this.globeCenter.z
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      const dot = (nx / len) * camDir.x + (ny / len) * camDir.y + (nz / len) * camDir.z
      if (dot > bestDot) {
        bestDot = dot
        bestTile = tile
      }
    }

    if (!bestTile) return null
    return new THREE.Vector3(bestTile.x, bestTile.z, -bestTile.y)
  }
}
