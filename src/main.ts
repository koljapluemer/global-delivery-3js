import * as THREE from 'three'
import { GlobeScene } from './view/game/globe_scene'
import { MainCamera } from './view/camera/main_camera'
import { TileCentersApi } from './controller/tile_centers_api'
import { TileCentersRenderer } from './view/debug/tile_centers_renderer'

/** Closest the camera can get, as a multiple of the globe's bounding radius. */
const ZOOM_MIN_RADIUS_FACTOR = 1.05
/** Furthest the camera can get, as a multiple of the globe's bounding radius. */
const ZOOM_MAX_RADIUS_FACTOR = 5.0
/** Initial camera distance from globe center, as a multiple of the bounding radius. */
const ZOOM_INITIAL_FIT_MARGIN = 2

// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

// scene & camera
const globeScene = new GlobeScene()
const mainCamera = new MainCamera(renderer.domElement)

// tile data
const tileCentersApi = new TileCentersApi()
tileCentersApi.load()
new TileCentersRenderer(globeScene.scene).render(tileCentersApi)

// load globe, then fit camera to its bounding sphere
globeScene.load().then(({ boundingSphere }) => {
  const { center, radius } = boundingSphere
  const fovRad = THREE.MathUtils.degToRad(mainCamera.camera.fov)
  const fitDistance = (radius / Math.sin(fovRad / 2)) * ZOOM_INITIAL_FIT_MARGIN
  const distMin = radius * ZOOM_MIN_RADIUS_FACTOR
  const distMax = radius * ZOOM_MAX_RADIUS_FACTOR

  mainCamera.camera.near = distMin * 0.01
  mainCamera.camera.far  = distMax * 2
  mainCamera.camera.updateProjectionMatrix()

  mainCamera.init(
    center,
    center.clone().add(new THREE.Vector3(0, 0, fitDistance)),
    distMin,
    distMax
  )
})

// render loop
function animate() {
  renderer.render(globeScene.scene, mainCamera.camera)
  requestAnimationFrame(animate)
}
animate()

// resize
window.addEventListener('resize', () => {
  mainCamera.setAspect(window.innerWidth / window.innerHeight)
  renderer.setSize(window.innerWidth, window.innerHeight)
})
