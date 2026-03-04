import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { TileCentersApi, TileCenter } from '../../controller/layer_0/tile_centers_api'
import { hsvColor, applyPrimaryColor } from './color_utils'
import crateUrl from '../../assets/items/crate.glb?url'
import roundedArrowUrl from '../../assets/ui/rounded_arrow.glb?url'

const CRATE_SCALE = 0.004
const CRATE_SURFACE_OFFSET = 0
const CARGO_ARROW_SCALE = 0.035
const CARGO_ARROW_SURFACE_OFFSET = 0.005

const UP = new THREE.Vector3(0, 1, 0)

/** Renders a ghost crate + optional arrow preview while in CRATE_DROP input mode. */
export class CrateDropPreview {
  private readonly scene: THREE.Scene
  private ghostCrate: THREE.Object3D | null = null
  private ghostArrow: THREE.Object3D | null = null
  private gltfCache = new Map<string, GLTF>()
  private updateGen = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  async update(
    dropTile: TileCenter,
    vehicleTileId: number,
    isValid: boolean,
    vehicleHue: number,
    globeCenter: THREE.Vector3,
    tileApi: TileCentersApi,
  ): Promise<void> {
    this.clearScene()
    const gen = ++this.updateGen

    const cratePos = new THREE.Vector3(dropTile.x, dropTile.z, -dropTile.y)
    const crateNormal = cratePos.clone().sub(globeCenter).normalize()

    // Load both GLTFs in parallel
    const [crateGltf, arrowGltf] = await Promise.all([
      this.loadGltf(crateUrl),
      this.loadGltf(roundedArrowUrl),
    ])
    if (this.updateGen !== gen) return  // superseded

    // Ghost crate
    const ghost = crateGltf.scene.clone()
    ghost.scale.setScalar(CRATE_SCALE)
    ghost.quaternion.setFromUnitVectors(UP, crateNormal)
    ghost.position.copy(cratePos).addScaledVector(crateNormal, CRATE_SURFACE_OFFSET)
    ghost.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const applyMat = (mat: THREE.Material) => {
        const m = (mat as THREE.MeshStandardMaterial).clone()
        m.transparent = true
        if (isValid) {
          m.opacity = 0.5
        } else {
          m.opacity = 0.3
          m.emissive = new THREE.Color(0xff4444)
          m.emissiveIntensity = 0.5
        }
        return m
      }
      child.material = Array.isArray(child.material)
        ? child.material.map(applyMat)
        : applyMat(child.material)
    })
    this.scene.add(ghost)
    this.ghostCrate = ghost

    // Arrow — only for valid tiles
    if (isValid) {
      const vehicleTile = tileApi.getTileById(vehicleTileId)
      if (vehicleTile) {
        const vehiclePos = new THREE.Vector3(vehicleTile.x, vehicleTile.z, -vehicleTile.y)
        const yAxis = vehiclePos.clone().sub(globeCenter).normalize()
        const toCrate = cratePos.clone().sub(vehiclePos)
        const zAxis = toCrate.clone().sub(yAxis.clone().multiplyScalar(toCrate.dot(yAxis))).normalize()
        const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis)

        const arrow = arrowGltf.scene.clone()
        arrow.scale.setScalar(CARGO_ARROW_SCALE)
        arrow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis))
        arrow.position.copy(vehiclePos).addScaledVector(yAxis, CARGO_ARROW_SURFACE_OFFSET)
        applyPrimaryColor(arrow, hsvColor(vehicleHue))
        this.scene.add(arrow)
        this.ghostArrow = arrow
      }
    }
  }

  hide(): void {
    ++this.updateGen
    this.clearScene()
  }

  private clearScene(): void {
    if (this.ghostCrate)  { this.scene.remove(this.ghostCrate);  this.ghostCrate  = null }
    if (this.ghostArrow)  { this.scene.remove(this.ghostArrow);  this.ghostArrow  = null }
  }

  private loadGltf(url: string): Promise<GLTF> {
    const cached = this.gltfCache.get(url)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => { this.gltfCache.set(url, gltf); resolve(gltf) }, undefined, reject)
    })
  }
}
