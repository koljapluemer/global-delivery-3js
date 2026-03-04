import * as THREE from 'three'
import { GlobeScene } from './view/game/globe_scene'
import { MainCamera } from './view/camera/main_camera'
import { GlobePointer } from './controller/globe_pointer'
import { setupLogHoveredTile } from './view/debug/log_hovered_tile'
import { TileCentersApi } from './controller/layer_0/tile_centers_api'
import { NavApi } from './controller/navigation'
import { generateWorld } from './model/world_generator'
import { PlanIntentManager } from './controller/plan_intent_manager'
import { UndoRedoHistory } from './controller/undo_redo'
import { derivePlanState, findFirstValidInsertionPoint } from './controller/plan_deriver'
import { GameItemRenderer } from './view/game/game_item_renderer'
import { LabelRenderer } from './view/game/label_renderer'
import { PlanPanel } from './view/ui/plan_panel/plan_panel'
import { InspectorPanel } from './view/ui/inspector_panel/inspector_panel'
import { HudPanel } from './view/ui/hud_panel/hud_panel'
import { InputModeController } from './controller/input_mode/input_mode'
import { PinPlacementPreview } from './view/game/pin_placement_preview'
import { CrateDropPreview } from './view/game/crate_drop_preview'
import { CrateLoadPreview } from './view/game/crate_load_preview'
import { CancelButton } from './view/ui/overlay/cancel_button'
import { PinContextMenu } from './view/ui/overlay/pin_context_menu'
import { CrateLoadMenu } from './view/ui/overlay/crate_load_menu'
import { hsvColor } from './view/game/color_utils'
import { deriveRouteLegs } from './controller/traveltime'
import type { TileCenter } from './controller/layer_0/tile_centers_api'
import type { DerivedPlanState } from './model/types/DerivedPlanState'
import type { GameState } from './model/types/GameState'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const globeScene = new GlobeScene()
const mainCamera = new MainCamera(renderer.domElement)
const tileCentersApi = new TileCentersApi()
const navApi = new NavApi()

tileCentersApi.load()
navApi.load()

const intentManager = new PlanIntentManager(generateWorld(tileCentersApi, navApi))
const undoHistory = new UndoRedoHistory()
let derived: DerivedPlanState = derivePlanState(intentManager.getPlan(), navApi, tileCentersApi)

const gameItemRenderer = new GameItemRenderer(globeScene.scene, navApi, renderer)
const inputModeController = new InputModeController()
const cancelButton = new CancelButton()

const gameState: GameState = { money: 0, stamps: 0, traveltimeBudget: 1000 }

const hudPanel = new HudPanel()
hudPanel.mount(document.body)

const planPanel = new PlanPanel()
planPanel.mount(document.body, tileCentersApi)

const inspectorPanel = new InspectorPanel()
inspectorPanel.mount(document.body)

cancelButton.mount(document.body, () => inputModeController.enterNormal())

let labelRenderer: LabelRenderer | null = null
let pinPlacementPreview: PinPlacementPreview | null = null
let crateDropPreview: CrateDropPreview | null = null
let crateLoadPreview: CrateLoadPreview | null = null
let lastValidLoadTarget: { vehicleId: number; insertAfterStepIndex: number } | null = null
let lastValidTransferTarget: { toVehicleId: number; insertAfterStepIndex: number } | null = null
let lastValidUnloadTarget: { toTileId: number; isDelivery: boolean; insertAfterStepIndex: number } | null = null
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

/** Returns the last tile the vehicle is headed to (or its initial position). */
function getVehicleLastTileId(vehicleId: number): number | null {
  const plan = intentManager.getPlan()
  for (let i = plan.steps.length - 1; i >= 0; i--) {
    const step = plan.steps[i]
    if (step.kind !== 'JOURNEY') continue
    const j = step.journeys.find((jj) => jj.vehicleId === vehicleId)
    if (j) return j.toTileId
  }
  return plan.initialState.vehiclePositions[vehicleId] ?? null
}

/** Get the snapshot just before a given step index (or initialSnapshot if stepIndex <= 0). */
function snapshotBefore(stepIndex: number): DerivedPlanState['initialSnapshot'] {
  if (stepIndex <= 0) return derived.initialSnapshot
  return derived.stepSnapshots[stepIndex - 1] ?? derived.initialSnapshot
}

/** Serialize derived snapshots to a JSON-serializable object and trigger download. */
function downloadDerivedSnapshots(): void {
  const snap = (m: ReadonlyMap<number, number>) => Object.fromEntries([...m.entries()].map(([k, v]) => [String(k), v]))
  const cargo = (m: ReadonlyMap<number, ReadonlySet<number>>) =>
    Object.fromEntries([...m.entries()].map(([k, v]) => [String(k), [...v]]))
  const snapshotToJson = (s: DerivedPlanState['initialSnapshot']) => ({
    vehiclePositions: snap(s.vehiclePositions),
    crateOnGround: snap(s.crateOnGround),
    vehicleCargo: cargo(s.vehicleCargo),
    validCargoActions: s.validCargoActions,
  })
  const payload = {
    initialSnapshot: snapshotToJson(derived.initialSnapshot),
    stepSnapshots: derived.stepSnapshots.map(snapshotToJson),
    deliveredCrates: [...derived.deliveredCrates],
    totalTraveltime: derived.totalTraveltime,
    occupiedTiles: [...derived.occupiedTiles],
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `derived-snapshots-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ---------------------------------------------------------------------------
// Shared re-render: dispose old 3D objects, re-derive and re-render everything.
// ---------------------------------------------------------------------------
async function rerender(): Promise<void> {
  derived = derivePlanState(intentManager.getPlan(), navApi, tileCentersApi)
  const legs = deriveRouteLegs(derived)
  gameItemRenderer.dispose()
  await gameItemRenderer.render(intentManager.getPlan(), derived, tileCentersApi, globeCenter)
  labelRenderer?.syncCrateLabels(intentManager.getPlan(), tileCentersApi)
  labelRenderer?.syncVehicleLabels(intentManager.getPlan(), tileCentersApi)
  labelRenderer?.syncPinsFromPlan(intentManager.getPlan(), tileCentersApi)
  labelRenderer?.syncRouteLegLabels(legs, tileCentersApi)
  hudPanel.update(gameState, derived.totalTraveltime, undoHistory.canUndo(), undoHistory.canRedo())
  planPanel.update(intentManager.getPlan(), derived)
}

// ---------------------------------------------------------------------------
// Wire inspector "Add Pin" button → enter PIN_PLACEMENT mode
// ---------------------------------------------------------------------------
inspectorPanel.onAddPin = (vehicleId) => {
  const fromTileId = getVehicleLastTileId(vehicleId)
  if (fromTileId === null) return
  inputModeController.enterPinPlacement(vehicleId, fromTileId)
}

// ---------------------------------------------------------------------------
// Wire inspector and plan panel remove callbacks
// ---------------------------------------------------------------------------
inspectorPanel.onRemoveJourneyIntent = async (stepIndex, vehicleId) => {
  undoHistory.snapshot(intentManager.getPlan())
  intentManager.removeJourneyIntent(stepIndex, vehicleId)
  await rerender()
  inspectorPanel.refresh(intentManager.getPlan(), derived, tileCentersApi)
}
inspectorPanel.onRemoveCargoIntent = async (stepIndex) => {
  undoHistory.snapshot(intentManager.getPlan())
  intentManager.removeCargoIntent(stepIndex)
  await rerender()
  inspectorPanel.refresh(intentManager.getPlan(), derived, tileCentersApi)
}
inspectorPanel.onUnloadFromStep = (vehicleId, stepIndex, crateId) => {
  inspectorPanel.hide()
  inputModeController.enterCrateDrop(vehicleId, stepIndex, crateId)
}

planPanel.onRemoveJourneyIntent = async (stepIndex, vehicleId) => {
  undoHistory.snapshot(intentManager.getPlan())
  intentManager.removeJourneyIntent(stepIndex, vehicleId)
  await rerender()
}
planPanel.onRemoveCargoIntent = async (stepIndex) => {
  undoHistory.snapshot(intentManager.getPlan())
  intentManager.removeCargoIntent(stepIndex)
  await rerender()
}
planPanel.onMoveJourneyIntent = async (vehicleId, fromStepIndex, toStepIndex) => {
  undoHistory.snapshot(intentManager.getPlan())
  intentManager.moveJourneyIntent(vehicleId, fromStepIndex, toStepIndex)
  await rerender()
}
planPanel.onMoveCargoStep = async (fromStepIndex, toAfterStepIndex) => {
  undoHistory.snapshot(intentManager.getPlan())
  intentManager.moveCargoStep(fromStepIndex, toAfterStepIndex)
  await rerender()
}

// ---------------------------------------------------------------------------
// Undo/redo
// ---------------------------------------------------------------------------
hudPanel.onUndo = async () => {
  const prev = undoHistory.undo(intentManager.getPlan())
  if (prev) { intentManager.resetPlan(prev); await rerender() }
}
hudPanel.onRedo = async () => {
  const next = undoHistory.redo(intentManager.getPlan())
  if (next) { intentManager.resetPlan(next); await rerender() }
}
hudPanel.onDownloadSnapshots = () => downloadDerivedSnapshots()
window.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.key === 'z') { hudPanel.onUndo?.(); e.preventDefault() }
  if (e.ctrlKey && e.key === 'y') { hudPanel.onRedo?.(); e.preventDefault() }
})

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
    lastValidTransferTarget = null
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

  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndcFromEvent(e, renderer.domElement), mainCamera.camera)
  const hits = raycaster.intersectObjects([...gameItemRenderer.getPickableObjects()], true)
  if (!hits.length) return
  const meta = hits[0].object.userData

  if (meta.entityType === 'PIN') {
    const plan = intentManager.getPlan()
    const stepIndex: number = meta.stepIndex
    // prevTileId: vehicle position before this journey step
    const prevSnapshot = snapshotBefore(stepIndex)
    const prevTileId = prevSnapshot.vehiclePositions.get(meta.vehicleId)
    if (prevTileId === undefined) return
    // nextTileId: next journey step for this vehicle after stepIndex
    let nextTileId: number | undefined
    for (let i = stepIndex + 1; i < plan.steps.length; i++) {
      const s = plan.steps[i]
      if (s.kind !== 'JOURNEY') continue
      const jj = s.journeys.find((j) => j.vehicleId === meta.vehicleId)
      if (jj) { nextTileId = jj.toTileId; break }
    }
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
      // Click → open context menu above the pin
      pinPlacementPreview?.hide()
      inputModeController.enterNormal()
      pinContextMenu.show(
        mode.vehicleId, mode.stepIndex,
        intentManager.getPlan(), derived, tileCentersApi,
        e.clientX, e.clientY,
        {
          onUnload: (crateId) => {
            labelRenderer?.setPinLabelOffset(mode.vehicleId, mode.stepIndex, 0)
            pinContextMenu.hide()
            inputModeController.enterCrateDrop(mode.vehicleId, mode.stepIndex, crateId)
          },
          onRemoveUnload: async (cargoStepIndex) => {
            labelRenderer?.setPinLabelOffset(mode.vehicleId, mode.stepIndex, 0)
            undoHistory.snapshot(intentManager.getPlan())
            intentManager.removeCargoIntent(cargoStepIndex)
            pinContextMenu.hide()
            await rerender()
            inspectorPanel.refresh(intentManager.getPlan(), derived, tileCentersApi)
          },
          onClose: () => labelRenderer?.setPinLabelOffset(mode.vehicleId, mode.stepIndex, 0),
        },
      )
      labelRenderer?.setPinLabelOffset(mode.vehicleId, mode.stepIndex, 80)
      return
    }
    // Drag → move the pin
    if (lastHoveredTile) {
      undoHistory.snapshot(intentManager.getPlan())
      intentManager.updateJourneyTarget(mode.stepIndex, mode.vehicleId, lastHoveredTile.tile_id)
    }
    pinPlacementPreview?.hide()
    await rerender()
    inspectorPanel.show({ kind: 'VEHICLE', id: mode.vehicleId }, intentManager.getPlan(), derived, tileCentersApi)
    inputModeController.enterNormal()
    return
  }

  if (mode.kind === 'ROUTE_SPLIT') {
    if (dragged && lastHoveredTile) {
      undoHistory.snapshot(intentManager.getPlan())
      intentManager.insertJourneyStepAfter(mode.insertAfterStepIndex, mode.vehicleId, lastHoveredTile.tile_id)
    }
    pinPlacementPreview?.hide()
    await rerender()
    inspectorPanel.show({ kind: 'VEHICLE', id: mode.vehicleId }, intentManager.getPlan(), derived, tileCentersApi)
    inputModeController.enterNormal()
    return
  }

  if (mode.kind === 'CRATE_DROP') {
    if (lastValidTransferTarget) {
      const { toVehicleId, insertAfterStepIndex } = lastValidTransferTarget
      undoHistory.snapshot(intentManager.getPlan())
      intentManager.insertCargoStepAfter(insertAfterStepIndex, {
        kind: 'TRANSFER',
        crateId: mode.crateId,
        fromVehicleId: mode.vehicleId,
        toVehicleId,
      })
      lastValidTransferTarget = null
      crateDropPreview?.hide()
      await rerender()
      inspectorPanel.show({ kind: 'VEHICLE', id: toVehicleId }, intentManager.getPlan(), derived, tileCentersApi)
      inputModeController.enterNormal()
    } else if (lastValidUnloadTarget) {
      const { toTileId, isDelivery, insertAfterStepIndex } = lastValidUnloadTarget
      undoHistory.snapshot(intentManager.getPlan())
      intentManager.insertCargoStepAfter(insertAfterStepIndex, isDelivery
        ? { kind: 'DELIVER', crateId: mode.crateId, vehicleId: mode.vehicleId, toTileId }
        : { kind: 'UNLOAD', crateId: mode.crateId, vehicleId: mode.vehicleId, toTileId })
      lastValidUnloadTarget = null
      crateDropPreview?.hide()
      await rerender()
      inspectorPanel.show({ kind: 'VEHICLE', id: mode.vehicleId }, intentManager.getPlan(), derived, tileCentersApi)
      inputModeController.enterNormal()
    }
    return
  }

  if (mode.kind === 'CRATE_LOAD') {
    if (!dragged && lastValidLoadTarget) {
      undoHistory.snapshot(intentManager.getPlan())
      intentManager.insertCargoStepAfter(lastValidLoadTarget.insertAfterStepIndex, {
        kind: 'LOAD',
        crateId: mode.crateId,
        vehicleId: lastValidLoadTarget.vehicleId,
      })
      crateLoadPreview?.hide()
      await rerender()
      inspectorPanel.show({ kind: 'VEHICLE', id: lastValidLoadTarget.vehicleId }, intentManager.getPlan(), derived, tileCentersApi)
      inputModeController.enterNormal()
    }
    return
  }

  if (mode.kind === 'PIN_PLACEMENT') {
    if (!lastHoveredTile) return
    undoHistory.snapshot(intentManager.getPlan())
    intentManager.addPinAfterLastVehicleStep(mode.vehicleId, lastHoveredTile.tile_id)
    pinPlacementPreview?.hide()
    await rerender()
    inspectorPanel.show({ kind: 'VEHICLE', id: mode.vehicleId }, intentManager.getPlan(), derived, tileCentersApi)
    inputModeController.enterNormal()
    return
  }

  // NORMAL mode + no meaningful drag → treat as selection click
  if (!dragged) {
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndcFromEvent(e, renderer.domElement), mainCamera.camera)
    const hits = raycaster.intersectObjects([...gameItemRenderer.getPickableObjects()], true)
    if (!hits.length) { inspectorPanel.hide(); return }
    const meta = hits[0].object.userData as {
      entityType?: string; entityId?: number; crateId?: number; stepIndex?: number;
      tileId?: number; actionIndex?: number
    }
    if (meta.entityType === 'VEHICLE') {
      inspectorPanel.show({ kind: 'VEHICLE', id: meta.entityId! }, intentManager.getPlan(), derived, tileCentersApi)
    } else if (meta.entityType === 'CRATE' || meta.entityType === 'GHOST_CRATE') {
      const crateId = meta.entityType === 'CRATE' ? meta.entityId! : meta.crateId!
      const stepIndex = meta.stepIndex ?? 0
      const crateTileId = meta.tileId ?? 0
      crateLoadMenu.show(crateId, intentManager.getPlan(), e.clientX, e.clientY, {
        onLoad: () => {
          crateLoadMenu.hide()
          inputModeController.enterCrateLoad(crateId, stepIndex, crateTileId)
        },
        onClose: () => {},
      })
    } else if (meta.entityType === 'INVALID_INTENT') {
      undoHistory.snapshot(intentManager.getPlan())
      intentManager.removeCargoIntent(meta.stepIndex!)
      await rerender()
    } else {
      inspectorPanel.hide()
    }
  }
})

// ---------------------------------------------------------------------------
// Hover highlight: raycast pickables on every mousemove
// ---------------------------------------------------------------------------
renderer.domElement.addEventListener('mousemove', (e) => {
  const mode = inputModeController.getMode()
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndcFromEvent(e, renderer.domElement), mainCamera.camera)
  const hits = raycaster.intersectObjects([...gameItemRenderer.getPickableObjects()], true)

  if (mode.kind === 'CRATE_LOAD') {
    const hitMeta = hits[0]?.object?.userData as
      { entityType?: string; entityId?: number; vehicleId?: number; stepIndex?: number } | undefined

    let vehicleId: number | undefined
    if (hitMeta?.entityType === 'VEHICLE' && hitMeta.entityId !== undefined) {
      vehicleId = hitMeta.entityId
    } else if (hitMeta?.entityType === 'PIN' && hitMeta.vehicleId !== undefined) {
      vehicleId = hitMeta.vehicleId
    }

    if (vehicleId !== undefined) {
      const intent = { kind: 'LOAD' as const, crateId: mode.crateId, vehicleId }
      const insertAfter = findFirstValidInsertionPoint(intent, derived)
      if (insertAfter !== null) {
        lastValidLoadTarget = { vehicleId, insertAfterStepIndex: insertAfter }
        const snap = derived.stepSnapshots[insertAfter]
        const crateTileAtLoad = snap.crateOnGround.get(mode.crateId)
        const vehicleTileAtLoad = snap.vehiclePositions.get(vehicleId)
        gameItemRenderer.setHovered(hits[0].object)
        if (crateTileAtLoad !== undefined && vehicleTileAtLoad !== undefined) {
          const hue = intentManager.getPlan().vehicles[vehicleId]?.hue ?? 0
          crateLoadPreview?.update(crateTileAtLoad, vehicleTileAtLoad, hue, globeCenter, tileCentersApi)
        } else {
          crateLoadPreview?.hide()
        }
      } else {
        lastValidLoadTarget = null
        gameItemRenderer.setHovered(null)
        crateLoadPreview?.hide()
      }
    } else {
      lastValidLoadTarget = null
      gameItemRenderer.setHovered(null)
      crateLoadPreview?.hide()
    }
    return
  }

  if (mode.kind === 'CRATE_DROP') {
    const hitMeta = hits[0]?.object?.userData as
      { entityType?: string; entityId?: number; vehicleId?: number; stepIndex?: number } | undefined

    let toVehicleId: number | undefined
    if (hitMeta?.entityType === 'VEHICLE' && hitMeta.entityId !== mode.vehicleId && hitMeta.entityId !== undefined) {
      toVehicleId = hitMeta.entityId
    } else if (hitMeta?.entityType === 'PIN' && hitMeta.vehicleId !== mode.vehicleId && hitMeta.vehicleId !== undefined) {
      toVehicleId = hitMeta.vehicleId
    }

    if (toVehicleId !== undefined) {
      const intent = {
        kind: 'TRANSFER' as const,
        crateId: mode.crateId,
        fromVehicleId: mode.vehicleId,
        toVehicleId,
      }
      const insertAfter = findFirstValidInsertionPoint(intent, derived)
      if (insertAfter !== null) {
        lastValidTransferTarget = { toVehicleId, insertAfterStepIndex: insertAfter }
        const snap = derived.stepSnapshots[insertAfter]
        const fromTile = snap.vehiclePositions.get(mode.vehicleId)
        const toTile = snap.vehiclePositions.get(toVehicleId)
        gameItemRenderer.setHovered(hits[0].object)
        if (fromTile !== undefined && toTile !== undefined) {
          const hue = intentManager.getPlan().vehicles[mode.vehicleId]?.hue ?? 0
          crateDropPreview?.updateTransfer(fromTile, toTile, hue, globeCenter, tileCentersApi)
        }
      } else {
        lastValidTransferTarget = null
        gameItemRenderer.setHovered(null)
      }
    } else {
      lastValidTransferTarget = null
      gameItemRenderer.setHovered(null)
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
      if (lastValidTransferTarget !== null) return  // keep transfer preview when hovering pin/vehicle
      const crate = intentManager.getPlan().crates[mode.crateId]
      const isDelivery = crate && tile.country_name === crate.destinationCountry
      const intent = isDelivery
        ? { kind: 'DELIVER' as const, crateId: mode.crateId, vehicleId: mode.vehicleId, toTileId: tile.tile_id }
        : { kind: 'UNLOAD' as const, crateId: mode.crateId, vehicleId: mode.vehicleId, toTileId: tile.tile_id }
      {
        const insertAfter = findFirstValidInsertionPoint(intent, derived)
        if (insertAfter !== null) {
          lastValidUnloadTarget = { toTileId: tile.tile_id, isDelivery, insertAfterStepIndex: insertAfter }
          const snap = derived.stepSnapshots[insertAfter]
          const vehicleTileId = snap.vehiclePositions.get(mode.vehicleId)
          if (vehicleTileId !== undefined) {
            crateDropPreview?.update(
              tile, vehicleTileId, true,
              intentManager.getPlan().vehicles[mode.vehicleId]?.hue ?? 0,
              globeCenter, tileCentersApi,
            )
          }
        } else {
          lastValidUnloadTarget = null
          crateDropPreview?.hide()
        }
      }
      return
    }

    crateDropPreview?.hide()

    if (mode.kind === 'CRATE_LOAD') return

    const vehicle = intentManager.getPlan().vehicles[mode.vehicleId]
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

  gameItemRenderer.render(intentManager.getPlan(), derived, tileCentersApi, globeCenter)

  labelRenderer = new LabelRenderer(mainCamera.camera, boundingSphere.center, boundingSphere.radius)
  labelRenderer.onEntityClick = (target) => {
    inspectorPanel.show(target, intentManager.getPlan(), derived, tileCentersApi)
  }
  const plan = intentManager.getPlan()
  const legs = deriveRouteLegs(derived)
  labelRenderer.syncCrateLabels(plan, tileCentersApi)
  labelRenderer.syncVehicleLabels(plan, tileCentersApi)
  labelRenderer.syncPinsFromPlan(plan, tileCentersApi)
  labelRenderer.syncRouteLegLabels(legs, tileCentersApi)
  hudPanel.update(gameState, derived.totalTraveltime, undoHistory.canUndo(), undoHistory.canRedo())
  planPanel.update(plan, derived)
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
