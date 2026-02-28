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
import { PlanPanel } from './view/ui/plan_panel/plan_panel'
import { InspectorPanel } from './view/ui/inspector_panel/inspector_panel'

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

new PlanPanel(gameItemStateManager.getPlan(), tileCentersApi).mount(document.body)

const inspectorPanel = new InspectorPanel()
inspectorPanel.mount(document.body)

renderer.domElement.addEventListener('click', (e) => {
  const rect = renderer.domElement.getBoundingClientRect()
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndc, mainCamera.camera)
  const hits = raycaster.intersectObjects([...gameItemRenderer.getPickableObjects()], true)
  if (hits.length === 0) { inspectorPanel.hide(); return }
  const meta = hits[0].object.userData as { entityType?: string; entityId?: number }
  if (!meta.entityType || meta.entityId === undefined) { inspectorPanel.hide(); return }
  inspectorPanel.show(
    meta.entityType === 'VEHICLE'
      ? { kind: 'VEHICLE', id: meta.entityId }
      : { kind: 'CRATE', id: meta.entityId },
    gameItemStateManager.getPlan(),
    tileCentersApi,
  )
})

let labelRenderer: LabelRenderer | null = null

globeScene.load().then(({ boundingSphere }) => {
  mainCamera.fitToGlobe(boundingSphere)

  const pointer = new GlobePointer(renderer.domElement, mainCamera.camera, tileCentersApi, boundingSphere)
  setupLogHoveredTile(pointer)

  gameItemRenderer.render(gameItemStateManager, tileCentersApi, boundingSphere.center)

  labelRenderer = new LabelRenderer(mainCamera.camera, boundingSphere.center, boundingSphere.radius)
  labelRenderer.onEntityClick = (target) => {
    inspectorPanel.show(target, gameItemStateManager.getPlan(), tileCentersApi)
  }
  const plan = gameItemStateManager.getPlan()
  labelRenderer.syncFromTimestep(plan.steps[0], plan.crates, tileCentersApi)
  labelRenderer.syncPinsFromPlan(plan, tileCentersApi)
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
