import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import globeUrl from '../../assets/globe/world.glb?url'

/** Scale factor applied to the raw bounding sphere radius. Tune until the sphere fits the globe. */
const BOUNDING_SPHERE_SCALE = 0.579

export interface GlobeLoadResult {
  object: THREE.Object3D
  boundingSphere: THREE.Sphere
}

export class GlobeScene {
  readonly scene: THREE.Scene

  constructor() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x222222)

    const dirLight = new THREE.DirectionalLight(0xffffff, 2)
    dirLight.position.set(5, 5, 5)
    this.scene.add(dirLight)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    this.scene.add(ambientLight)
  }

  load(): Promise<GlobeLoadResult> {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(
        globeUrl,
        (gltf) => {
          const object = gltf.scene
          this.scene.add(object)
          const box = new THREE.Box3().setFromObject(object)
          const boundingSphere = box.getBoundingSphere(new THREE.Sphere())
          boundingSphere.radius *= BOUNDING_SPHERE_SCALE

        //   const debugMesh = new THREE.Mesh(
        //     new THREE.SphereGeometry(boundingSphere.radius, 32, 32),
        //     new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.4 })
        //   )
        //   debugMesh.position.copy(boundingSphere.center)
        //   this.scene.add(debugMesh)

          resolve({ object, boundingSphere })
        },
        undefined,
        reject
      )
    })
  }
}
