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
import { CrateDropPreview } from './view/game/crate_drop_preview'
import { CrateLoadPreview } from './view/game/crate_load_preview'
import { CancelButton } from './view/ui/overlay/cancel_button'
import { PinContextMenu } from './view/ui/overlay/pin_context_menu'
import { CrateLoadMenu } from './view/ui/overlay/crate_load_menu'
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
const stateManager = new GameItemStateManager(DEMO_PLAN, navApi)
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
let crateDropPreview: CrateDropPreview | null = null
let crateLoadPreview: CrateLoadPreview | null = null
let lastValidLoadTarget: { vehicleId: number; loadAtStep: number } | null = null
const pinContextMenu = new PinContextMenu()
pinContextMenu.mount(document.body)
const crateLoadMenu = new CrateLoadMenu()
crateLoadMenu.mount(document.body)
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
  const needsCancel = mode.kind === 'PIN_PLACEMENT' || mode.kind === 'CRATE_DROP' || mode.kind === 'CRATE_LOAD'
  cancelButton[needsCancel ? 'show' : 'hide']()
  renderer.domElement.style.cursor =
    mode.kind === 'PIN_PLACEMENT' || mode.kind === 'CRATE_DROP' || mode.kind === 'CRATE_LOAD' ? 'crosshair' :
    (mode.kind === 'PIN_DRAG' || mode.kind === 'ROUTE_SPLIT') ? 'grabbing' : ''
  if (mode.kind === 'NORMAL') {
    pinPlacementPreview?.hide()
    crateDropPreview?.hide()
    crateLoadPreview?.hide()
    pinContextMenu.hide()
    crateLoadMenu.hide()
    lastValidLoadTarget = null
  }
  if (mode.kind !== 'NORMAL') gameItemRenderer.setHovered(null)
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
    if (!dragged) {
      // Click (not drag) → open context menu above the pin
      pinPlacementPreview?.hide()
      inputModeController.enterNormal()
      pinContextMenu.show(
        mode.vehicleId, mode.stepIndex,
        stateManager.getPlan(), tileCentersApi,
        e.clientX, e.clientY,
        {
          onUnload: (crateId) => {
            labelRenderer?.setPinLabelOffset(mode.vehicleId, mode.stepIndex, 0)
            pinContextMenu.hide()
            inputModeController.enterCrateDrop(mode.vehicleId, mode.stepIndex, crateId)
          },
          onRemoveUnload: async (crateId) => {
            labelRenderer?.setPinLabelOffset(mode.vehicleId, mode.stepIndex, 0)
            stateManager.removeAction(mode.stepIndex, { kind: 'CRATE_UNLOADED', crateId })
            pinContextMenu.hide()
            await rerender()
            inspectorPanel.refresh(stateManager.getPlan(), tileCentersApi)
          },
          onClose: () => labelRenderer?.setPinLabelOffset(mode.vehicleId, mode.stepIndex, 0),
        },
      )
      labelRenderer?.setPinLabelOffset(mode.vehicleId, mode.stepIndex, 80)
      return
    }
    // Drag → move the pin
    if (lastHoveredTile) {
      stateManager.moveVehicleStep(mode.vehicleId, mode.stepIndex, lastHoveredTile.tile_id)
    }
    pinPlacementPreview?.hide()
    await rerender()
    inspectorPanel.show({ kind: 'VEHICLE', id: mode.vehicleId }, stateManager.getPlan(), tileCentersApi)
    inputModeController.enterNormal()
    return
  }

  if (mode.kind === 'ROUTE_SPLIT') {
    if (dragged && lastHoveredTile) {
      stateManager.insertVehicleStep(mode.vehicleId, mode.insertAfterStepIndex, lastHoveredTile.tile_id)
    }
    pinPlacementPreview?.hide()
    await rerender()
    inspectorPanel.show({ kind: 'VEHICLE', id: mode.vehicleId }, stateManager.getPlan(), tileCentersApi)
    inputModeController.enterNormal()
    return
  }

  if (mode.kind === 'CRATE_DROP') {
    if (lastHoveredTile) {
      const plan = stateManager.getPlan()
      const vehicleTileId = stateManager.getVehicleTileAtStep(mode.vehicleId, mode.stepIndex)
      const isValid = lastHoveredTile.is_land &&
        plan.steps[mode.stepIndex]?.tileOccupations[lastHoveredTile.tile_id] === undefined &&
        vehicleTileId !== undefined &&
        navApi.getNeighbors(vehicleTileId, 'ALL').includes(lastHoveredTile.tile_id)
      if (isValid) {
        stateManager.addCrateUnload(mode.stepIndex, mode.crateId, lastHoveredTile.tile_id)
        crateDropPreview?.hide()
        await rerender()
        inspectorPanel.show({ kind: 'VEHICLE', id: mode.vehicleId }, stateManager.getPlan(), tileCentersApi)
        inputModeController.enterNormal()
      }
      // Invalid tile → stay in CRATE_DROP, do nothing
    }
    return
  }

  if (mode.kind === 'CRATE_LOAD') {
    if (!dragged && lastValidLoadTarget) {
      stateManager.addCrateLoad(lastValidLoadTarget.loadAtStep, mode.crateId, lastValidLoadTarget.vehicleId)
      crateLoadPreview?.hide()
      await rerender()
      inspectorPanel.show({ kind: 'VEHICLE', id: lastValidLoadTarget.vehicleId }, stateManager.getPlan(), tileCentersApi)
      inputModeController.enterNormal()
    }
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
    const meta = hits[0].object.userData as { entityType?: string; entityId?: number; crateId?: number; stepIndex?: number; tileId?: number }
    if (meta.entityType === 'VEHICLE') {
      inspectorPanel.show({ kind: 'VEHICLE', id: meta.entityId! }, stateManager.getPlan(), tileCentersApi)
    } else if (meta.entityType === 'CRATE' || meta.entityType === 'GHOST_CRATE') {
      const crateId = meta.entityType === 'CRATE' ? meta.entityId! : meta.crateId!
      const stepIndex = meta.stepIndex ?? 0
      const crateTileId = meta.tileId!
      crateLoadMenu.show(crateId, stateManager.getPlan(), e.clientX, e.clientY, {
        onLoad: () => {
          crateLoadMenu.hide()
          inputModeController.enterCrateLoad(crateId, stepIndex, crateTileId)
        },
        onClose: () => {},
      })
    } else {
      inspectorPanel.hide()
    }
  }
})

// ---------------------------------------------------------------------------
// Hover highlight: raycast pickables on every mousemove (NORMAL mode only)
// ---------------------------------------------------------------------------
renderer.domElement.addEventListener('mousemove', (e) => {
  const mode = inputModeController.getMode()
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndcFromEvent(e, renderer.domElement), mainCamera.camera)
  const hits = raycaster.intersectObjects([...gameItemRenderer.getPickableObjects()], true)

  if (mode.kind === 'CRATE_LOAD') {
    const hitMeta = hits[0]?.object?.userData as
      { entityType?: string; entityId?: number; vehicleId?: number; stepIndex?: number } | undefined

    // Determine candidate vehicleId and the step at which loading would occur.
    // For a VEHICLE entity (rendered at step 0): loading happens at the crate's arrival step.
    // For a PIN entity: loading happens at the pin's step (must be >= crate's arrival step).
    let vehicleId: number | undefined
    let loadAtStep: number | undefined
    if (hitMeta?.entityType === 'VEHICLE') {
      vehicleId = hitMeta.entityId
      loadAtStep = mode.stepIndex
    } else if (hitMeta?.entityType === 'PIN' &&
               hitMeta.stepIndex !== undefined &&
               hitMeta.stepIndex >= mode.stepIndex) {
      vehicleId = hitMeta.vehicleId
      loadAtStep = hitMeta.stepIndex
    }

    // Valid iff: crate is still at its tile at the load step (not yet loaded by another action)
    //        AND the vehicle is on an exactly neighboring tile at the load step.
    const plan = stateManager.getPlan()
    const crateStillThere = loadAtStep !== undefined &&
      plan.steps[loadAtStep]?.tileOccupations[mode.crateTileId]?.[1] === mode.crateId
    const vehicleTileAtLoad = vehicleId !== undefined && loadAtStep !== undefined
      ? stateManager.getVehicleTileAtStep(vehicleId, loadAtStep)
      : undefined
    const navMesh = vehicleId !== undefined
      ? plan.vehicles[vehicleId]?.vehicleType.navMesh
      : undefined
    const valid = vehicleId !== undefined &&
      loadAtStep !== undefined &&
      crateStillThere &&
      vehicleTileAtLoad !== undefined &&
      navMesh !== undefined &&
      navApi.getNeighbors(mode.crateTileId, navMesh).includes(vehicleTileAtLoad)

    lastValidLoadTarget = valid ? { vehicleId: vehicleId!, loadAtStep: loadAtStep! } : null
    gameItemRenderer.setHovered(valid ? hits[0].object : null)
    if (valid) {
      const hue = plan.vehicles[vehicleId!]?.hue ?? 0
      crateLoadPreview?.update(mode.crateTileId, vehicleTileAtLoad!, hue, globeCenter, tileCentersApi)
    } else {
      crateLoadPreview?.hide()
    }
    return
  }

  if (mode.kind !== 'NORMAL') return
  gameItemRenderer.setHovered(hits[0]?.object ?? null)
})

// ---------------------------------------------------------------------------
// Post-globe-load: pointer, preview, initial render, labels
// ---------------------------------------------------------------------------
globeScene.load().then(({ boundingSphere }) => {
  globeCenter = boundingSphere.center.clone()
  mainCamera.fitToGlobe(boundingSphere)

  pinPlacementPreview = new PinPlacementPreview(globeScene.scene, navApi)
  crateDropPreview = new CrateDropPreview(globeScene.scene)
  crateLoadPreview = new CrateLoadPreview(globeScene.scene)

  const pointer = new GlobePointer(renderer.domElement, mainCamera.camera, tileCentersApi, boundingSphere)
  setupLogHoveredTile(pointer)

  pointer.onHover = (tile) => {
    lastHoveredTile = tile
    const mode = inputModeController.getMode()

    if (!tile || mode.kind === 'NORMAL') {
      pinPlacementPreview?.hide()
      crateDropPreview?.hide()
      crateLoadPreview?.hide()
      return
    }

    if (mode.kind === 'CRATE_DROP') {
      pinPlacementPreview?.hide()
      const plan = stateManager.getPlan()
      const vehicleTileId = stateManager.getVehicleTileAtStep(mode.vehicleId, mode.stepIndex)
      if (vehicleTileId === undefined) return
      const isValid = tile.is_land &&
        plan.steps[mode.stepIndex]?.tileOccupations[tile.tile_id] === undefined &&
        navApi.getNeighbors(vehicleTileId, 'ALL').includes(tile.tile_id)
      crateDropPreview?.update(
        tile, vehicleTileId, isValid,
        plan.vehicles[mode.vehicleId]?.hue ?? 0,
        globeCenter, tileCentersApi,
      )
      return
    }

    crateDropPreview?.hide()

    // CRATE_LOAD uses object-based hover (handled in mousemove), not tile-based
    if (mode.kind === 'CRATE_LOAD') return

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
