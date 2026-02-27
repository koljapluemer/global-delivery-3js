import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import globeUrl from './assets/globe/world.glb?url'

// scene
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x222222)

// camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  100
)
camera.position.z = 2

// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

// lights
const dirLight = new THREE.DirectionalLight(0xffffff, 2)
dirLight.position.set(5, 5, 5)
scene.add(dirLight)

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
scene.add(ambientLight)

// load globe
const loader = new GLTFLoader()
let globe: THREE.Object3D | null = null

loader.load(globeUrl, (gltf) => {
  globe = gltf.scene
  scene.add(globe)

  // fit camera to model regardless of its scale
  const box = new THREE.Box3().setFromObject(globe)
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const fovRad = THREE.MathUtils.degToRad(camera.fov)
  const distance = sphere.radius / Math.sin(fovRad / 2) * 1.2
  camera.position.set(0, 0, sphere.center.z + distance)
  camera.near = distance * 0.01
  camera.far = distance * 10
  camera.updateProjectionMatrix()
})

// animation loop
function animate() {
  if (globe) {
    globe.rotation.y += 0.005
  }
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

animate()

// handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
