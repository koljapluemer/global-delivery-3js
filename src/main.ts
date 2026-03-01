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
import { InputModeController } from './controller/input_mode/input_mode'
import { PinPlacementPreview } from './view/game/pin_placement_preview'
import { CancelButton } from './view/ui/overlay/cancel_button'
import { hsvColor } from './view/game/color_utils'
import type { TileCenter } from './controller/layer_0/tile_centers_api'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const globeScene = new GlobeScene()
const mainCamera = new MainCamera(renderer.domElement)
const tileCentersApi = new TileCentersApi()
const navApi = new NavApi()
const stateManager = new GameItemStateManager(DEMO_PLAN)
const gameItemRenderer = new GameItemRenderer(globeScene.scene, navApi)
const inputModeController = new InputModeController()
const cancelButton = new CancelButton()

tileCentersApi.load()
navApi.load()

const planPanel = new PlanPanel(stateManager.getPlan(), tileCentersApi)
planPanel.mount(document.body)

const inspectorPanel = new InspectorPanel()
inspectorPanel.mount(document.body)

cancelButton.mount(document.body, () => inputModeController.enterNormal())

// Wire inspector "Add Pin" button to enter PIN_PLACEMENT mode
inspectorPanel.onAddPin = (vehicleId) => {
  const fromTileId = stateManager.getVehicleLastTileId(vehicleId)
  if (fromTileId === null) return
  inputModeController.enterPinPlacement(vehicleId, fromTileId)
}

// Sync UI/cursor to mode changes
inputModeController.onChange((mode) => {
  if (mode.kind === 'PIN_PLACEMENT') {
    cancelButton.show()
    renderer.domElement.style.cursor = 'crosshair'
  } else {
    cancelButton.hide()
    renderer.domElement.style.cursor = ''
    pinPlacementPreview?.hide()
  }
})

let labelRenderer: LabelRenderer | null = null
let pinPlacementPreview: PinPlacementPreview | null = null
let lastHoveredTile: TileCenter | null = null
let globeCenter = new THREE.Vector3()

// Mode-aware click handler
renderer.domElement.addEventListener('click', async (e) => {
  const mode = inputModeController.getMode()

  if (mode.kind === 'NORMAL') {
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
      stateManager.getPlan(),
      tileCentersApi,
    )
    return
  }

  if (mode.kind === 'PIN_PLACEMENT') {
    if (!lastHoveredTile) return
    stateManager.addVehicleStep(mode.vehicleId, lastHoveredTile.tile_id)

    pinPlacementPreview?.hide()
    gameItemRenderer.dispose()
    const plan = stateManager.getPlan()
    await gameItemRenderer.render(stateManager, tileCentersApi, globeCenter)
    labelRenderer?.syncFromTimestep(plan.steps[0], plan.crates, tileCentersApi)
    labelRenderer?.syncPinsFromPlan(plan, tileCentersApi)
    planPanel.update()
    inspectorPanel.show({ kind: 'VEHICLE', id: mode.vehicleId }, plan, tileCentersApi)
    inputModeController.enterNormal()
  }
})

globeScene.load().then(({ boundingSphere }) => {
  globeCenter = boundingSphere.center.clone()
  mainCamera.fitToGlobe(boundingSphere)

  pinPlacementPreview = new PinPlacementPreview(globeScene.scene, navApi)

  const pointer = new GlobePointer(renderer.domElement, mainCamera.camera, tileCentersApi, boundingSphere)
  setupLogHoveredTile(pointer)

  pointer.onHover = (tile) => {
    lastHoveredTile = tile
    const mode = inputModeController.getMode()
    if (mode.kind !== 'PIN_PLACEMENT' || !tile) {
      pinPlacementPreview?.hide()
      return
    }
    const vehicle = stateManager.getPlan().vehicles[mode.vehicleId]
    if (!vehicle) return
    pinPlacementPreview?.update(
      tile,
      mode.fromTileId,
      vehicle.vehicleType.navMesh,
      vehicle.vehicleType.offsetAlongNormal,
      hsvColor(vehicle.hue),
      globeCenter,
      tileCentersApi,
    )
  }

  gameItemRenderer.render(stateManager, tileCentersApi, globeCenter)

  labelRenderer = new LabelRenderer(mainCamera.camera, boundingSphere.center, boundingSphere.radius)
  labelRenderer.onEntityClick = (target) => {
    inspectorPanel.show(target, stateManager.getPlan(), tileCentersApi)
  }
  const plan = stateManager.getPlan()
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
