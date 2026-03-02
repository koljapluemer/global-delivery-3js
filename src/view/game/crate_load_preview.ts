import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { TileCentersApi } from '../../controller/layer_0/tile_centers_api'
import { hsvColor, applyPrimaryColor } from './color_utils'
import roundedArrowUrl from '../../assets/ui/rounded_arrow.glb?url'

const CARGO_ARROW_SCALE = 0.035
const CARGO_ARROW_SURFACE_OFFSET = 0.005

/** Renders a ghost arrow from a crate's tile toward the loading vehicle's tile. */
export class CrateLoadPreview {
  private readonly scene: THREE.Scene
  private ghostArrow: THREE.Object3D | null = null
  private gltfCache = new Map<string, GLTF>()
  private updateGen = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  async update(
    crateTileId: number,
    vehicleTileId: number,
    vehicleHue: number,
    globeCenter: THREE.Vector3,
    tileApi: TileCentersApi,
  ): Promise<void> {
    this.clearScene()
    const gen = ++this.updateGen

    const crateTile = tileApi.getTileById(crateTileId)
    const vehicleTile = tileApi.getTileById(vehicleTileId)
    if (!crateTile || !vehicleTile) return

    const arrowGltf = await this.loadGltf(roundedArrowUrl)
    if (this.updateGen !== gen) return  // superseded

    const cratePos = new THREE.Vector3(crateTile.x, crateTile.z, -crateTile.y)
    const vehiclePos = new THREE.Vector3(vehicleTile.x, vehicleTile.z, -vehicleTile.y)

    // Arrow sits at crate tile, points toward vehicle (same math as renderCargoLoadingArrows)
    const yAxis = cratePos.clone().sub(globeCenter).normalize()
    const toVehicle = vehiclePos.clone().sub(cratePos)
    const zAxis = toVehicle.clone().sub(yAxis.clone().multiplyScalar(toVehicle.dot(yAxis))).normalize()
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis)

    const arrow = arrowGltf.scene.clone()
    arrow.scale.setScalar(CARGO_ARROW_SCALE)
    arrow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis))
    arrow.position.copy(cratePos).addScaledVector(yAxis, CARGO_ARROW_SURFACE_OFFSET)
    applyPrimaryColor(arrow, hsvColor(vehicleHue))
    this.scene.add(arrow)
    this.ghostArrow = arrow
  }

  hide(): void {
    ++this.updateGen
    this.clearScene()
  }

  private clearScene(): void {
    if (this.ghostArrow) { this.scene.remove(this.ghostArrow); this.ghostArrow = null }
  }

  private loadGltf(url: string): Promise<GLTF> {
    const cached = this.gltfCache.get(url)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => { this.gltfCache.set(url, gltf); resolve(gltf) }, undefined, reject)
    })
  }
}
