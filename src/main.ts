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
import type { StepAction } from './model/types/StepAction'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const globeScene = new GlobeScene()
const mainCamera = new MainCamera(renderer.domElement)
const tileCentersApi = new TileCentersApi()
const navApi = new NavApi()
const stateManager = new GameItemStateManager(DEMO_PLAN)
const gameItemRenderer = new GameItemRenderer(globeScene.scene, navApi, renderer)
const inputModeController = new InputModeController()
const cancelButton = new CancelButton()

tileCentersApi.load()
navApi.load()

const planPanel = new PlanPanel(stateManager.getPlan(), tileCentersApi)
planPanel.mount(document.body)

const inspectorPanel = new InspectorPanel()
inspectorPanel.mount(document.body)

cancelButton.mount(document.body, () => inputModeController.enterNormal())

let labelRenderer: LabelRenderer | null = null
let pinPlacementPreview: PinPlacementPreview | null = null
let lastHoveredTile: TileCenter | null = null
let globeCenter = new THREE.Vector3()
let mousedownPos: { x: number; y: number } | null = null
const DRAG_PX = 5

function ndcFromEvent(e: MouseEvent, canvas: HTMLCanvasElement): THREE.Vector2 {
  const rect = canvas.getBoundingClientRect()
  return new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  )
}

// ---------------------------------------------------------------------------
// Shared re-render: dispose old 3D objects, re-render from current plan state.
// ---------------------------------------------------------------------------
async function rerender(): Promise<void> {
  const plan = stateManager.getPlan()
  gameItemRenderer.dispose()
  await gameItemRenderer.render(stateManager, tileCentersApi, globeCenter)
  labelRenderer?.syncFromTimestep(plan.steps[0], plan.crates, tileCentersApi)
  labelRenderer?.syncPinsFromPlan(plan, tileCentersApi)
  planPanel.update()
}

// ---------------------------------------------------------------------------
// Wire inspector "Add Pin" button → enter PIN_PLACEMENT mode
// ---------------------------------------------------------------------------
inspectorPanel.onAddPin = (vehicleId) => {
  const fromTileId = stateManager.getVehicleLastTileId(vehicleId)
  if (fromTileId === null) return
  inputModeController.enterPinPlacement(vehicleId, fromTileId)
}

// ---------------------------------------------------------------------------
// Wire both panels' per-action remove buttons → mutate plan + full re-render
// ---------------------------------------------------------------------------
const handleRemoveAction = async (stepIndex: number, action: StepAction) => {
  stateManager.removeAction(stepIndex, action)
  await rerender()
  inspectorPanel.refresh(stateManager.getPlan(), tileCentersApi)
}
inspectorPanel.onRemoveAction = handleRemoveAction
planPanel.onRemoveAction = handleRemoveAction

// ---------------------------------------------------------------------------
// Sync UI / cursor when input mode changes
// ---------------------------------------------------------------------------
inputModeController.onChange((mode) => {
  cancelButton[mode.kind === 'PIN_PLACEMENT' ? 'show' : 'hide']()
  renderer.domElement.style.cursor =
    mode.kind === 'PIN_PLACEMENT' ? 'crosshair' :
    (mode.kind === 'PIN_DRAG' || mode.kind === 'ROUTE_SPLIT') ? 'grabbing' : ''
  if (mode.kind === 'NORMAL') pinPlacementPreview?.hide()
})

// ---------------------------------------------------------------------------
// Drag detection: mousedown starts a potential drag; mouseup confirms or clicks
// ---------------------------------------------------------------------------
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  mousedownPos = { x: e.clientX, y: e.clientY }
  if (inputModeController.getMode().kind !== 'NORMAL') return

  // Raycast to check if the user started a drag on a PIN or ROUTE_LINE
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndcFromEvent(e, renderer.domElement), mainCamera.camera)
  const hits = raycaster.intersectObjects([...gameItemRenderer.getPickableObjects()], true)
  if (!hits.length) return
  const meta = hits[0].object.userData

  if (meta.entityType === 'PIN') {
    const prevTileId = stateManager.getVehicleTileAtStep(meta.vehicleId, meta.stepIndex - 1)
    if (prevTileId === undefined) return
    const nextTileId = stateManager.getVehicleTileAtStep(meta.vehicleId, meta.stepIndex + 1)
    inputModeController.enterPinDrag(meta.vehicleId, meta.stepIndex, prevTileId, nextTileId)
  } else if (meta.entityType === 'ROUTE_LINE') {
    inputModeController.enterRouteSplit(
      meta.vehicleId, meta.insertAfterStepIndex, meta.fromTileId, meta.toTileId)
  }
})

renderer.domElement.addEventListener('mouseup', async (e) => {
  if (e.button !== 0) return
  const mode = inputModeController.getMode()
  const dragged = mousedownPos !== null && (
    Math.abs(e.clientX - mousedownPos.x) > DRAG_PX ||
    Math.abs(e.clientY - mousedownPos.y) > DRAG_PX)
  mousedownPos = null

  if (mode.kind === 'PIN_DRAG') {
    if (dragged && lastHoveredTile) {
      stateManager.moveVehicleStep(mode.vehicleId, mode.stepIndex, lastHoveredTile.tile_id)
    }
    pinPlacementPreview?.hide()
    await rerender()
    inputModeController.enterNormal()
    return
  }

  if (mode.kind === 'ROUTE_SPLIT') {
    if (dragged && lastHoveredTile) {
      stateManager.insertVehicleStep(mode.vehicleId, mode.insertAfterStepIndex, lastHoveredTile.tile_id)
    }
    pinPlacementPreview?.hide()
    await rerender()
    inputModeController.enterNormal()
    return
  }

  if (mode.kind === 'PIN_PLACEMENT') {
    if (!lastHoveredTile) return
    stateManager.addVehicleStep(mode.vehicleId, lastHoveredTile.tile_id)
    pinPlacementPreview?.hide()
    await rerender()
    inspectorPanel.show({ kind: 'VEHICLE', id: mode.vehicleId }, stateManager.getPlan(), tileCentersApi)
    inputModeController.enterNormal()
    return
  }

  // NORMAL mode + no meaningful drag → treat as selection click
  if (!dragged) {
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndcFromEvent(e, renderer.domElement), mainCamera.camera)
    const hits = raycaster.intersectObjects([...gameItemRenderer.getPickableObjects()], true)
    if (!hits.length) { inspectorPanel.hide(); return }
    const meta = hits[0].object.userData as { entityType?: string; entityId?: number }
    if (meta.entityType === 'VEHICLE' || meta.entityType === 'CRATE') {
      inspectorPanel.show(
        meta.entityType === 'VEHICLE'
          ? { kind: 'VEHICLE', id: meta.entityId! }
          : { kind: 'CRATE',  id: meta.entityId! },
        stateManager.getPlan(),
        tileCentersApi,
      )
    } else {
      inspectorPanel.hide()
    }
  }
})

// ---------------------------------------------------------------------------
// Post-globe-load: pointer, preview, initial render, labels
// ---------------------------------------------------------------------------
globeScene.load().then(({ boundingSphere }) => {
  globeCenter = boundingSphere.center.clone()
  mainCamera.fitToGlobe(boundingSphere)

  pinPlacementPreview = new PinPlacementPreview(globeScene.scene, navApi)

  const pointer = new GlobePointer(renderer.domElement, mainCamera.camera, tileCentersApi, boundingSphere)
  setupLogHoveredTile(pointer)

  pointer.onHover = (tile) => {
    lastHoveredTile = tile
    const mode = inputModeController.getMode()

    if (!tile || mode.kind === 'NORMAL') {
      pinPlacementPreview?.hide()
      return
    }

    const vehicle = stateManager.getPlan().vehicles[mode.vehicleId]
    if (!vehicle) return

    const fromTileId =
      mode.kind === 'PIN_PLACEMENT' ? mode.fromTileId :
      mode.kind === 'PIN_DRAG'      ? mode.prevTileId :
                                      mode.fromTileId   // ROUTE_SPLIT

    const toTileId: number | undefined =
      mode.kind === 'PIN_DRAG'    ? mode.nextTileId :
      mode.kind === 'ROUTE_SPLIT' ? mode.toTileId   :
                                    undefined

    pinPlacementPreview?.update(
      tile,
      fromTileId,
      vehicle.vehicleType.navMesh,
      vehicle.vehicleType.offsetAlongNormal,
      hsvColor(vehicle.hue),
      globeCenter,
      tileCentersApi,
      toTileId,
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

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
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
