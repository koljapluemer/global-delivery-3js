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
import { createActor } from 'xstate'
import { inputModeMachine } from './controller/input_mode/input_mode_machine'
import { InteractionManager } from 'three.interactive'
import { DragGesture } from '@use-gesture/vanilla'
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
const inputModeActor = createActor(inputModeMachine).start()
const cancelButton = new CancelButton()
let interactionManager: InteractionManager | null = null
let addedPickables: THREE.Object3D[] = []

function syncInteractionManager(): void {
  if (!interactionManager) return
  addedPickables.forEach((o) => interactionManager!.remove(o))
  addedPickables = []
  const pickables = gameItemRenderer.getPickableObjects()
  pickables.forEach((obj) => {
    interactionManager!.add(obj)
    addedPickables.push(obj)
    const onHover = (isOver: boolean) => {
      // #region agent log
      if (isOver) fetch('http://127.0.0.1:7244/ingest/addc2f4a-639b-4e2f-b495-8f3a189e2b6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:mouseover',message:'hover',data:{entityType:(obj.userData as {entityType?:string})?.entityType,entityId:(obj.userData as {entityId?:number})?.entityId,pickablesCount:addedPickables.length},timestamp:Date.now(),hypothesisId:'H5-H6'})}).catch(()=>{});
      // #endregion
      gameItemRenderer.setHovered(isOver ? obj : null)
      const snapshot = inputModeActor.getSnapshot()
      if (!snapshot.matches({ value: 'crateLoad' }) || !isOver) return
      const ctx = snapshot.context
      const meta = obj.userData as { entityType?: string; entityId?: number; vehicleId?: number }
      let vehicleId: number | undefined
      if (meta.entityType === 'VEHICLE' && meta.entityId !== undefined) vehicleId = meta.entityId
      else if (meta.entityType === 'PIN' && meta.vehicleId !== undefined) vehicleId = meta.vehicleId
      if (vehicleId !== undefined && ctx.crateId !== undefined) {
        const intent = { kind: 'LOAD' as const, crateId: ctx.crateId, vehicleId }
        const insertAfter = findFirstValidInsertionPoint(intent, derived)
        if (insertAfter !== null) {
          inputModeActor.send({ type: 'UPDATE_LOAD_TARGET', payload: { vehicleId, insertAfterStepIndex: insertAfter } })
          const snap = derived.stepSnapshots[insertAfter]
          const crateTileAtLoad = snap.crateOnGround.get(ctx.crateId)
          const vehicleTileAtLoad = snap.vehiclePositions.get(vehicleId)
          if (crateTileAtLoad !== undefined && vehicleTileAtLoad !== undefined) {
            const hue = intentManager.getPlan().vehicles[vehicleId]?.hue ?? 0
            crateLoadPreview?.update(crateTileAtLoad, vehicleTileAtLoad, hue, globeCenter, tileCentersApi)
          } else crateLoadPreview?.hide()
        } else {
          inputModeActor.send({ type: 'UPDATE_LOAD_TARGET', payload: null })
          crateLoadPreview?.hide()
        }
      } else {
        inputModeActor.send({ type: 'UPDATE_LOAD_TARGET', payload: null })
        crateLoadPreview?.hide()
      }
    }
    ;(obj as THREE.Object3D & { addEventListener: (name: string, fn: () => void) => void }).addEventListener('mouseover', () => onHover(true))
    ;(obj as THREE.Object3D & { addEventListener: (name: string, fn: () => void) => void }).addEventListener('mouseout', () => {
      gameItemRenderer.setHovered(null)
      if (inputModeActor.getSnapshot().matches({ value: 'crateLoad' })) {
        inputModeActor.send({ type: 'UPDATE_LOAD_TARGET', payload: null })
        crateLoadPreview?.hide()
      }
    })
    // Normal-mode clicks are handled in handlePointerUp via pointerDownHit; no object click listener to avoid duplicates.
  })
}

const gameState: GameState = { money: 0, stamps: 0, traveltimeBudget: 1000 }

const hudPanel = new HudPanel()
hudPanel.mount(document.body)

const planPanel = new PlanPanel()
planPanel.mount(document.body, tileCentersApi)

const inspectorPanel = new InspectorPanel()
inspectorPanel.mount(document.body)

cancelButton.mount(document.body, () => inputModeActor.send({ type: 'CANCEL' }))

let labelRenderer: LabelRenderer | null = null
let pinPlacementPreview: PinPlacementPreview | null = null
let crateDropPreview: CrateDropPreview | null = null
let crateLoadPreview: CrateLoadPreview | null = null
const pinContextMenu = new PinContextMenu()
pinContextMenu.mount(document.body)
const crateLoadMenu = new CrateLoadMenu()
crateLoadMenu.mount(document.body)
let lastHoveredTile: TileCenter | null = null
let globeCenter = new THREE.Vector3()
let pointerDownHit: { meta: Record<string, unknown>; object: THREE.Object3D } | null = null
let lastPointerUp = { clientX: 0, clientY: 0 }
const DRAG_THRESHOLD_PX = 5

renderer.domElement.addEventListener('pointerup', (e: PointerEvent) => {
  lastPointerUp = { clientX: e.clientX, clientY: e.clientY }
})

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
  syncInteractionManager()
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
  inputModeActor.send({ type: 'ENTER_PIN_PLACEMENT', vehicleId, fromTileId })
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
  inputModeActor.send({ type: 'ENTER_CRATE_DROP', vehicleId, stepIndex, crateId })
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
planPanel.onMoveJourneyIntentIntoStep = async (vehicleId, fromStepIndex, toStepIndex) => {
  undoHistory.snapshot(intentManager.getPlan())
  intentManager.moveJourneyIntentIntoStep(vehicleId, fromStepIndex, toStepIndex)
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
// Sync UI / cursor when input mode changes (XState snapshot)
// ---------------------------------------------------------------------------
inputModeActor.subscribe((snapshot) => {
  const isNormal = snapshot.matches({ value: 'normal' })
  const isPinPlacement = snapshot.matches({ value: 'pinPlacement' })
  const isCrateDrop = snapshot.matches({ value: 'crateDrop' })
  const isCrateLoad = snapshot.matches({ value: 'crateLoad' })
  const isPinDrag = snapshot.matches({ value: 'pinDrag' })
  const isRouteSplit = snapshot.matches({ value: 'routeSplit' })
  const needsCancel = isPinPlacement || isCrateDrop || isCrateLoad
  cancelButton[needsCancel ? 'show' : 'hide']()
  renderer.domElement.style.cursor =
    isPinPlacement || isCrateDrop || isCrateLoad ? 'crosshair' :
    isPinDrag || isRouteSplit ? 'grabbing' : ''
  if (isNormal) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/addc2f4a-639b-4e2f-b495-8f3a189e2b6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:machine-subscribe',message:'normal branch hiding panels',data:{isNormal},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    pinPlacementPreview?.hide()
    crateDropPreview?.hide()
    crateLoadPreview?.hide()
    pinContextMenu.hide()
    crateLoadMenu.hide()
  }
  if (!isNormal) gameItemRenderer.setHovered(null)
})

// ---------------------------------------------------------------------------
// Pointer down: record hit and transition to pinDrag/routeSplit if PIN/ROUTE_LINE
// ---------------------------------------------------------------------------
renderer.domElement.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== 0) return
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndcFromEvent(e as unknown as MouseEvent, renderer.domElement), mainCamera.camera)
    const hits = raycaster.intersectObjects([...gameItemRenderer.getPickableObjects()], true)
    pointerDownHit = hits.length ? { meta: hits[0].object.userData as Record<string, unknown>, object: hits[0].object } : null
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/addc2f4a-639b-4e2f-b495-8f3a189e2b6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:pointerdown',message:'pointer down',data:{hitsLen:hits.length,entityType:pointerDownHit?.meta?.entityType,entityId:pointerDownHit?.meta?.entityId},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion

    const snapshot = inputModeActor.getSnapshot()
    if (!snapshot.matches({ value: 'normal' })) return
    if (!hits.length) return
    const meta = hits[0].object.userData as Record<string, unknown>

    if (meta.entityType === 'PIN') {
      const plan = intentManager.getPlan()
      const stepIndex = meta.stepIndex as number
      const prevSnapshot = snapshotBefore(stepIndex)
      const prevTileId = prevSnapshot.vehiclePositions.get(meta.vehicleId as number)
      if (prevTileId === undefined) return
      let nextTileId: number | undefined
      for (let i = stepIndex + 1; i < plan.steps.length; i++) {
        const s = plan.steps[i]
        if (s.kind !== 'JOURNEY') continue
        const jj = s.journeys.find((j) => j.vehicleId === meta.vehicleId)
        if (jj) { nextTileId = jj.toTileId; break }
      }
      inputModeActor.send({
        type: 'POINTER_DOWN_PIN',
        vehicleId: meta.vehicleId as number,
        stepIndex,
        prevTileId,
        nextTileId,
      })
    } else if (meta.entityType === 'ROUTE_LINE') {
      inputModeActor.send({
        type: 'POINTER_DOWN_ROUTE_LINE',
        vehicleId: meta.vehicleId as number,
        insertAfterStepIndex: meta.insertAfterStepIndex as number,
        fromTileId: meta.fromTileId as number,
        toTileId: meta.toTileId as number,
      })
    }
  },
  true,
)

// ---------------------------------------------------------------------------
// Drag vs click: use-gesture reports pointer up; we handle by mode and context
// ---------------------------------------------------------------------------
const handlePointerUp = async (e: { clientX: number; clientY: number }, isDrag: boolean) => {
  const snapshot = inputModeActor.getSnapshot()
  const ctx = snapshot.context
  // #region agent log
  const stateValue = typeof snapshot.value === 'object' && snapshot.value !== null && 'value' in snapshot.value ? (snapshot.value as { value: string }).value : String(snapshot.value);
  fetch('http://127.0.0.1:7244/ingest/addc2f4a-639b-4e2f-b495-8f3a189e2b6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:handlePointerUp',message:'pointer up',data:{stateValue,isDrag,hasPointerDownHit:!!pointerDownHit,entityType:pointerDownHit?.meta?.entityType},timestamp:Date.now(),hypothesisId:'H1-H3'})}).catch(()=>{});
  // #endregion

  if (snapshot.matches({ value: 'pinDrag' })) {
    const vehicleId = ctx.vehicleId!
    const stepIndex = ctx.stepIndex!
    if (!isDrag) {
      pinPlacementPreview?.hide()
      inputModeActor.send({ type: 'POINTER_UP', isDrag: false })
      pinContextMenu.show(
        vehicleId,
        stepIndex,
        intentManager.getPlan(),
        derived,
        tileCentersApi,
        e.clientX,
        e.clientY,
        {
          onUnload: (crateId) => {
            labelRenderer?.setPinLabelOffset(vehicleId, stepIndex, 0)
            pinContextMenu.hide()
            inputModeActor.send({ type: 'ENTER_CRATE_DROP', vehicleId, stepIndex, crateId })
          },
          onRemoveUnload: async (cargoStepIndex) => {
            labelRenderer?.setPinLabelOffset(vehicleId, stepIndex, 0)
            undoHistory.snapshot(intentManager.getPlan())
            intentManager.removeCargoIntent(cargoStepIndex)
            pinContextMenu.hide()
            await rerender()
            inspectorPanel.refresh(intentManager.getPlan(), derived, tileCentersApi)
          },
          onClose: () => labelRenderer?.setPinLabelOffset(vehicleId, stepIndex, 0),
        },
      )
      labelRenderer?.setPinLabelOffset(vehicleId, stepIndex, 80)
    } else {
      if (lastHoveredTile) {
        undoHistory.snapshot(intentManager.getPlan())
        intentManager.updateJourneyTarget(stepIndex, vehicleId, lastHoveredTile.tile_id)
      }
      pinPlacementPreview?.hide()
      await rerender()
      inspectorPanel.show({ kind: 'VEHICLE', id: vehicleId }, intentManager.getPlan(), derived, tileCentersApi)
      inputModeActor.send({ type: 'CONFIRM_PIN_DRAG' })
    }
    pointerDownHit = null
    return
  }

  if (snapshot.matches({ value: 'routeSplit' })) {
    const vehicleId = ctx.vehicleId!
    const insertAfterStepIndex = ctx.insertAfterStepIndex!
    if (isDrag && lastHoveredTile) {
      undoHistory.snapshot(intentManager.getPlan())
      intentManager.insertJourneyStepAfter(insertAfterStepIndex, vehicleId, lastHoveredTile.tile_id)
    }
    pinPlacementPreview?.hide()
    await rerender()
    inspectorPanel.show({ kind: 'VEHICLE', id: vehicleId }, intentManager.getPlan(), derived, tileCentersApi)
    inputModeActor.send({ type: 'CONFIRM_ROUTE_SPLIT' })
    pointerDownHit = null
    return
  }

  if (snapshot.matches({ value: 'crateDrop' })) {
    const unload = ctx.lastValidUnloadTarget
    if (unload) {
      const { toTileId, isDelivery, insertAfterStepIndex } = unload
      undoHistory.snapshot(intentManager.getPlan())
      intentManager.insertCargoStepAfter(
        insertAfterStepIndex,
        isDelivery
          ? { kind: 'DELIVER', crateId: ctx.crateId!, vehicleId: ctx.vehicleId!, toTileId }
          : { kind: 'UNLOAD', crateId: ctx.crateId!, vehicleId: ctx.vehicleId!, toTileId },
      )
      crateDropPreview?.hide()
      await rerender()
      inspectorPanel.show({ kind: 'VEHICLE', id: ctx.vehicleId! }, intentManager.getPlan(), derived, tileCentersApi)
    }
    inputModeActor.send({ type: 'CONFIRM_CRATE_DROP' })
    pointerDownHit = null
    return
  }

  if (snapshot.matches({ value: 'crateLoad' })) {
    if (!isDrag && ctx.lastValidLoadTarget) {
      const { vehicleId, insertAfterStepIndex } = ctx.lastValidLoadTarget
      undoHistory.snapshot(intentManager.getPlan())
      intentManager.insertCargoStepAfter(insertAfterStepIndex, {
        kind: 'LOAD',
        crateId: ctx.crateId!,
        vehicleId,
      })
      crateLoadPreview?.hide()
      await rerender()
      inspectorPanel.show({ kind: 'VEHICLE', id: vehicleId }, intentManager.getPlan(), derived, tileCentersApi)
    }
    inputModeActor.send({ type: 'CONFIRM_CRATE_LOAD' })
    pointerDownHit = null
    return
  }

  if (snapshot.matches({ value: 'pinPlacement' })) {
    if (lastHoveredTile) {
      undoHistory.snapshot(intentManager.getPlan())
      intentManager.addPinAfterLastVehicleStep(ctx.vehicleId!, lastHoveredTile.tile_id)
      pinPlacementPreview?.hide()
      await rerender()
      inspectorPanel.show({ kind: 'VEHICLE', id: ctx.vehicleId! }, intentManager.getPlan(), derived, tileCentersApi)
    }
    inputModeActor.send({ type: 'CONFIRM_PIN_PLACEMENT', vehicleId: ctx.vehicleId!, fromTileId: ctx.fromTileId! })
    pointerDownHit = null
    return
  }

  const isNormalState = snapshot.value === 'normal' || (typeof snapshot.value === 'object' && snapshot.value !== null && (snapshot.value as { value?: string }).value === 'normal')
  if (isNormalState && !isDrag && pointerDownHit) {
    const meta = pointerDownHit.meta as {
      entityType?: string
      entityId?: number
      crateId?: number
      stepIndex?: number
      tileId?: number
    }
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/addc2f4a-639b-4e2f-b495-8f3a189e2b6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:normal-branch',message:'normal click branch',data:{entityType:meta.entityType,entityId:meta.entityId,willShowInspector:meta.entityType==='VEHICLE',willShowCrateMenu:meta.entityType==='CRATE'||meta.entityType==='GHOST_CRATE'},timestamp:Date.now(),hypothesisId:'H3-H4'})}).catch(()=>{});
    // #endregion
    if (meta.entityType === 'VEHICLE') {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/addc2f4a-639b-4e2f-b495-8f3a189e2b6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:call-show-inspector',message:'calling inspectorPanel.show',data:{vehicleId:meta.entityId},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      inspectorPanel.show({ kind: 'VEHICLE', id: meta.entityId! }, intentManager.getPlan(), derived, tileCentersApi)
    } else if (meta.entityType === 'CRATE' || meta.entityType === 'GHOST_CRATE') {
      const crateId = meta.entityType === 'CRATE' ? meta.entityId! : meta.crateId!
      const stepIndex = meta.stepIndex ?? 0
      const crateTileId = meta.tileId ?? 0
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/addc2f4a-639b-4e2f-b495-8f3a189e2b6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:call-show-crateMenu',message:'calling crateLoadMenu.show',data:{crateId},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      crateLoadMenu.show(crateId, intentManager.getPlan(), e.clientX, e.clientY, {
        onLoad: () => {
          crateLoadMenu.hide()
          inputModeActor.send({ type: 'ENTER_CRATE_LOAD', crateId, stepIndex, crateTileId })
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
    pointerDownHit = null
  } else if (isNormalState) {
    inspectorPanel.hide()
    pointerDownHit = null
  }
}

new DragGesture(renderer.domElement, ({ last, movement }) => {
  // #region agent log
  if (last) fetch('http://127.0.0.1:7244/ingest/addc2f4a-639b-4e2f-b495-8f3a189e2b6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:DragGesture',message:'gesture last',data:{movement0:movement[0],movement1:movement[1]},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  if (!last) return
  const isDrag =
    Math.abs(movement[0]) > DRAG_THRESHOLD_PX || Math.abs(movement[1]) > DRAG_THRESHOLD_PX
  handlePointerUp(lastPointerUp, isDrag)
})

// Hover and click are handled by three.interactive (see post-globe-load); no mousemove raycast here.

// ---------------------------------------------------------------------------
// Post-globe-load: pointer, preview, initial render, labels
// ---------------------------------------------------------------------------
globeScene.load().then(async ({ boundingSphere }) => {
  globeCenter = boundingSphere.center.clone()
  mainCamera.fitToGlobe(boundingSphere)

  pinPlacementPreview = new PinPlacementPreview(globeScene.scene, navApi)
  crateDropPreview = new CrateDropPreview(globeScene.scene)
  crateLoadPreview = new CrateLoadPreview(globeScene.scene)

  const pointer = new GlobePointer(renderer.domElement, mainCamera.camera, tileCentersApi, boundingSphere)
  setupLogHoveredTile(pointer)

  pointer.onHover = (tile) => {
    lastHoveredTile = tile
    const snapshot = inputModeActor.getSnapshot()
    const ctx = snapshot.context

    if (!tile || snapshot.matches({ value: 'normal' })) {
      pinPlacementPreview?.hide()
      crateDropPreview?.hide()
      crateLoadPreview?.hide()
      return
    }

    if (snapshot.matches({ value: 'crateDrop' })) {
      pinPlacementPreview?.hide()
      const crate = intentManager.getPlan().crates[ctx.crateId!]
      const isDelivery = crate && tile.country_name === crate.destinationCountry
      const intent = isDelivery
        ? { kind: 'DELIVER' as const, crateId: ctx.crateId!, vehicleId: ctx.vehicleId!, toTileId: tile.tile_id }
        : { kind: 'UNLOAD' as const, crateId: ctx.crateId!, vehicleId: ctx.vehicleId!, toTileId: tile.tile_id }
      const insertAfter = findFirstValidInsertionPoint(intent, derived)
      if (insertAfter !== null) {
        inputModeActor.send({
          type: 'UPDATE_UNLOAD_TARGET',
          payload: { toTileId: tile.tile_id, isDelivery, insertAfterStepIndex: insertAfter },
        })
        const snap = derived.stepSnapshots[insertAfter]
        const vehicleTileId = snap.vehiclePositions.get(ctx.vehicleId!)
        if (vehicleTileId !== undefined) {
          crateDropPreview?.update(
            tile,
            vehicleTileId,
            true,
            intentManager.getPlan().vehicles[ctx.vehicleId!]?.hue ?? 0,
            globeCenter,
            tileCentersApi,
          )
        }
      } else {
        inputModeActor.send({ type: 'UPDATE_UNLOAD_TARGET', payload: null })
        crateDropPreview?.hide()
      }
      return
    }

    crateDropPreview?.hide()

    if (snapshot.matches({ value: 'crateLoad' })) return

    const vehicle = intentManager.getPlan().vehicles[ctx.vehicleId!]
    if (!vehicle) return

    const fromTileId =
      snapshot.matches({ value: 'pinPlacement' }) ? ctx.fromTileId! :
      snapshot.matches({ value: 'pinDrag' })       ? ctx.prevTileId! :
                                                     ctx.fromTileId!

    const toTileId: number | undefined =
      snapshot.matches({ value: 'pinDrag' })    ? ctx.nextTileId :
      snapshot.matches({ value: 'routeSplit' }) ? ctx.toTileId   :
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

  await gameItemRenderer.render(intentManager.getPlan(), derived, tileCentersApi, globeCenter)

  interactionManager = new InteractionManager(renderer, mainCamera.camera, renderer.domElement)
  syncInteractionManager()

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
  interactionManager?.update()
  renderer.render(globeScene.scene, mainCamera.camera)
  labelRenderer?.update(delta)
  requestAnimationFrame(animate)
}
animate()

window.addEventListener('resize', () => {
  mainCamera.setAspect(window.innerWidth / window.innerHeight)
  renderer.setSize(window.innerWidth, window.innerHeight)
})
