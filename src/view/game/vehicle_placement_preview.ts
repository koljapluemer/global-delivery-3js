import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { applyPrimaryColor } from './color_utils'
import { ITEM_SCALE } from './render_constants'

function cloneMaterialsInObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.material = Array.isArray(child.material)
      ? child.material.map((m: THREE.Material) => m.clone())
      : (child.material as THREE.Material).clone()
  })
}
import type { TileCenter } from '../../controller/layer_0/tile_centers_api'
import type { VehicleType } from '../../model/types/VehicleType'
import carUrl from '../../assets/items/vehicles/car.glb?url'
import boatUrl from '../../assets/items/vehicles/boat.glb?url'

const GHOST_OPACITY = 0.4
const INVALID_COLOR = new THREE.Color(0xff3333)
const VALID_COLOR = new THREE.Color(0xffffff)
const UP = new THREE.Vector3(0, 1, 0)

const MESH_URLS: Record<string, string> = {
  'assets/items/vehicles/car.glb': carUrl,
  'assets/items/vehicles/boat.glb': boatUrl,
}

/** Manages the ephemeral ghost vehicle mesh during VEHICLE_PLACEMENT mode. */
export class VehiclePlacementPreview {
  private readonly scene: THREE.Scene
  private ghost: THREE.Object3D | null = null
  private gltfCache = new Map<string, GLTF>()
  private updateGen = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  async update(
    tile: TileCenter,
    vehicleType: VehicleType,
    globeCenter: THREE.Vector3,
    isValid: boolean,
  ): Promise<void> {
    this.clearScene()
    const gen = ++this.updateGen

    const url = MESH_URLS[vehicleType.meshPath]
    if (!url) return

    const gltf = await this.loadGltf(url)
    if (this.updateGen !== gen) return

    const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
    const outwardNormal = tilePos.clone().sub(globeCenter).normalize()

    const obj = gltf.scene.clone()
    cloneMaterialsInObject(obj)
    obj.scale.setScalar(ITEM_SCALE)
    obj.quaternion.setFromUnitVectors(UP, outwardNormal)
    obj.position.copy(tilePos).addScaledVector(outwardNormal, vehicleType.offsetAlongNormal)

    const color = isValid ? VALID_COLOR : INVALID_COLOR
    applyPrimaryColor(obj, color)

    obj.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const applyOpacity = (mat: THREE.Material): THREE.Material => {
        const cloned = (mat as THREE.MeshStandardMaterial).clone()
        cloned.transparent = true
        cloned.opacity = GHOST_OPACITY
        return cloned
      }
      child.material = Array.isArray(child.material)
        ? child.material.map(applyOpacity)
        : applyOpacity(child.material)
    })

    this.scene.add(obj)
    this.ghost = obj
  }

  hide(): void {
    ++this.updateGen
    this.clearScene()
  }

  private clearScene(): void {
    if (this.ghost) {
      this.scene.remove(this.ghost)
      this.ghost = null
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
