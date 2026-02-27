import * as THREE from 'three'
import { GlobeScene } from './view/game/globe_scene'
import { MainCamera } from './view/camera/main_camera'
import { GlobePointer } from './controller/globe_pointer'
import { setupLogHoveredTile } from './view/debug/log_hovered_tile'
import { TileCentersApi } from './controller/layer_0/tile_centers_api'
import { GameItemStateManager } from './controller/layer_1/game_item_state_manager'
import { NavApi } from './controller/navigation'
import { DEMO_PLAN } from './model/db/demo_plan'
import { GameItemRenderer } from './view/game/game_item_renderer'
import { LabelRenderer } from './view/game/label_renderer'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const globeScene = new GlobeScene()
const mainCamera = new MainCamera(renderer.domElement)
const tileCentersApi = new TileCentersApi()
const navApi = new NavApi()
const gameItemStateManager = new GameItemStateManager(DEMO_PLAN)
const gameItemRenderer = new GameItemRenderer(globeScene.scene, navApi)

tileCentersApi.load()
navApi.load()

let labelRenderer: LabelRenderer | null = null

globeScene.load().then(({ boundingSphere }) => {
  mainCamera.fitToGlobe(boundingSphere)

  const pointer = new GlobePointer(renderer.domElement, mainCamera.camera, tileCentersApi, boundingSphere)
  setupLogHoveredTile(pointer)

  gameItemRenderer.render(gameItemStateManager, tileCentersApi, boundingSphere.center)

  labelRenderer = new LabelRenderer(mainCamera.camera, boundingSphere.center, boundingSphere.radius)
  labelRenderer.syncFromTimestep(gameItemStateManager.getStepAtIndex(0), tileCentersApi, boundingSphere.center)
  labelRenderer.syncPinsFromPlan(gameItemStateManager.getPlan(), tileCentersApi, boundingSphere.center)
})

let lastTime = performance.now()
function animate() {
  const now = performance.now()
  const delta = (now - lastTime) / 1000
  lastTime = now
  renderer.render(globeScene.scene, mainCamera.camera)
  labelRenderer?.update(delta)
  requestAnimationFrame(animate)
}
animate()

window.addEventListener('resize', () => {
  mainCamera.setAspect(window.innerWidth / window.innerHeight)
  renderer.setSize(window.innerWidth, window.innerHeight)
})
