import * as THREE from 'three'

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
camera.position.z = 5

// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

// geometry
const geometry = new THREE.BoxGeometry()

// IMPORTANT: MeshStandardMaterial needs light
const material = new THREE.MeshStandardMaterial({ color: 0xff8800 })

const cube = new THREE.Mesh(geometry, material)
scene.add(cube)

// light (required for standard material)
const light = new THREE.DirectionalLight(0xffffff, 2)
light.position.set(5, 5, 5)
scene.add(light)

// animation loop
function animate() {
  cube.rotation.x += 0.01
  cube.rotation.y += 0.01

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