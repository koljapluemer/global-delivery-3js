import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { NavApi } from '../../controller/navigation'
import type { TileCentersApi, TileCenter } from '../../controller/layer_0/tile_centers_api'
import { applyPrimaryColor } from './color_utils'
import pinUrl from '../../assets/ui/pin.glb?url'

const GHOST_PIN_SCALE = 0.02
const GHOST_PIN_SURFACE_OFFSET = -0.02
const GHOST_PIN_OPACITY = 0.35
const PREVIEW_LINE_OPACITY = 0.5

const UP = new THREE.Vector3(0, 1, 0)

/** Manages the ephemeral ghost pin and preview route line during PIN_PLACEMENT mode. */
export class PinPlacementPreview {
  private readonly scene: THREE.Scene
  private readonly navApi: NavApi
  private ghostPin: THREE.Object3D | null = null
  private previewLine: THREE.Line | null = null
  private previewLine2: THREE.Line | null = null
  private gltfCache = new Map<string, GLTF>()
  private updateGen = 0

  constructor(scene: THREE.Scene, navApi: NavApi) {
    this.scene = scene
    this.navApi = navApi
  }

  /**
   * Update the ghost pin and preview route line(s) to reflect hovering over `tile`.
   * The ghost pin is at `tile`; the first preview line runs from `fromTileId` to `tile`.
   * If `toTileId` is provided, a second preview line runs from `tile` to `toTileId`
   * (used for PIN_DRAG and ROUTE_SPLIT modes where the ghost sits between two endpoints).
   */
  async update(
    tile: TileCenter,
    fromTileId: number,
    navMesh: 'LAND' | 'WATER' | 'ALL',
    surfaceOffset: number,
    color: THREE.Color,
    globeCenter: THREE.Vector3,
    tileApi: TileCentersApi,
    toTileId?: number,
  ): Promise<void> {
    this.clearScene()
    const gen = ++this.updateGen

    const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
    const outwardNormal = tilePos.clone().sub(globeCenter).normalize()

    // Ghost pin
    const gltf = await this.loadGltf(pinUrl)
    if (this.updateGen !== gen) return  // superseded by a newer call or hide()
    const pin = gltf.scene.clone()
    pin.scale.setScalar(GHOST_PIN_SCALE)
    pin.quaternion.setFromUnitVectors(UP, outwardNormal)
    pin.position.copy(tilePos).addScaledVector(outwardNormal, GHOST_PIN_SURFACE_OFFSET)
    applyPrimaryColor(pin, color)
    pin.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const applyOpacity = (mat: THREE.Material) => {
        const cloned = (mat as THREE.MeshStandardMaterial).clone()
        cloned.transparent = true
        cloned.opacity = GHOST_PIN_OPACITY
        return cloned
      }
      child.material = Array.isArray(child.material)
        ? child.material.map(applyOpacity)
        : applyOpacity(child.material)
    })
    this.scene.add(pin)
    this.ghostPin = pin

    // Preview route line: fromTileId → tile
    const path = this.navApi.findPath(fromTileId, tile.tile_id, navMesh)
    if (path && path.length > 1) {
      this.previewLine = this.drawPreviewLine(path, tileApi, globeCenter, surfaceOffset, color)
    }

    // Optional second segment: tile → toTileId (for drag/split preview)
    if (toTileId !== undefined) {
      const path2 = this.navApi.findPath(tile.tile_id, toTileId, navMesh)
      if (path2 && path2.length > 1) {
        this.previewLine2 = this.drawPreviewLine(path2, tileApi, globeCenter, surfaceOffset, color)
      }
    }
  }

  /** Remove ghost pin and preview route lines from scene, and cancel any in-flight update. */
  hide(): void {
    ++this.updateGen
    this.clearScene()
  }

  private clearScene(): void {
    if (this.ghostPin)    { this.scene.remove(this.ghostPin);    this.ghostPin    = null }
    if (this.previewLine)  { this.scene.remove(this.previewLine);  this.previewLine  = null }
    if (this.previewLine2) { this.scene.remove(this.previewLine2); this.previewLine2 = null }
  }

  private drawPreviewLine(
    pathTileIds: number[],
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
    surfaceOffset: number,
    color: THREE.Color,
  ): THREE.Line {
    const points: THREE.Vector3[] = []
    for (const tileId of pathTileIds) {
      const tile = tileApi.getTileById(tileId)
      if (!tile) continue
      const pos = new THREE.Vector3(tile.x, tile.z, -tile.y)
      const normal = pos.clone().sub(globeCenter).normalize()
      points.push(pos.clone().addScaledVector(normal, surfaceOffset))
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: PREVIEW_LINE_OPACITY })
    const line = new THREE.Line(geometry, material)
    this.scene.add(line)
    return line
  }

  private loadGltf(url: string): Promise<GLTF> {
    const cached = this.gltfCache.get(url)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => { this.gltfCache.set(url, gltf); resolve(gltf) }, undefined, reject)
    })
  }
}
