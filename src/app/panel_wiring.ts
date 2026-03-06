import { getVehicleLastTileId } from '../controller/plan_deriver'
import { downloadDerivedSnapshots } from './debug_export'
import type { Plan } from '../model/types/Plan'
import type { DerivedPlanState } from '../model/types/DerivedPlanState'
import type { PlanIntentManager } from '../controller/plan_intent_manager'
import type { UndoRedoHistory } from '../controller/undo_redo'
import type { InspectorPanel } from '../view/ui/inspector_panel/inspector_panel'
import type { PlanPanel } from '../view/ui/plan_panel/plan_panel'
import type { HudPanel } from '../view/ui/hud_panel/hud_panel'
import type { TileCentersApi } from '../controller/layer_0/tile_centers_api'
import type { Actor } from 'xstate'

export interface PanelWiringDeps {
  inspectorPanel: InspectorPanel
  planPanel: PlanPanel
  hudPanel: HudPanel
  intentManager: PlanIntentManager
  undoHistory: UndoRedoHistory
  inputModeActor: Actor<typeof import('../controller/input_mode/input_mode_machine').inputModeMachine>
  tileCentersApi: TileCentersApi
  rerender: () => Promise<void>
  getDerived: () => DerivedPlanState
  getPlan: () => Plan
  onConfirmPlan?: () => void
}

export function wirePanelCallbacks(deps: PanelWiringDeps): void {
  const {
    inspectorPanel,
    planPanel,
    hudPanel,
    intentManager,
    undoHistory,
    inputModeActor,
    tileCentersApi,
    rerender,
    getDerived,
    getPlan,
    onConfirmPlan,
  } = deps

  inspectorPanel.onAddPin = (vehicleId) => {
    const fromTileId = getVehicleLastTileId(getPlan(), vehicleId)
    if (fromTileId === null) return
    inputModeActor.send({ type: 'ENTER_PIN_PLACEMENT', vehicleId, fromTileId })
  }

  inspectorPanel.onRemoveJourneyIntent = async (stepIndex, vehicleId) => {
    undoHistory.snapshot(getPlan())
    intentManager.removeJourneyIntent(stepIndex, vehicleId)
    await rerender()
    inspectorPanel.refresh(getPlan(), getDerived(), tileCentersApi)
  }
  inspectorPanel.onRemoveCargoIntent = async (stepIndex) => {
    undoHistory.snapshot(getPlan())
    intentManager.removeCargoIntent(stepIndex)
    await rerender()
    inspectorPanel.refresh(getPlan(), getDerived(), tileCentersApi)
  }
  inspectorPanel.onUnloadFromStep = (vehicleId, stepIndex, crateId) => {
    inspectorPanel.hide()
    inputModeActor.send({ type: 'ENTER_CRATE_DROP', vehicleId, stepIndex, crateId })
  }

  planPanel.onRemoveJourneyIntent = async (stepIndex, vehicleId) => {
    undoHistory.snapshot(getPlan())
    intentManager.removeJourneyIntent(stepIndex, vehicleId)
    await rerender()
  }
  planPanel.onRemoveCargoIntent = async (stepIndex) => {
    undoHistory.snapshot(getPlan())
    intentManager.removeCargoIntent(stepIndex)
    await rerender()
  }
  planPanel.onMoveJourneyIntent = async (vehicleId, fromStepIndex, toStepIndex) => {
    undoHistory.snapshot(getPlan())
    intentManager.moveJourneyIntent(vehicleId, fromStepIndex, toStepIndex)
    await rerender()
  }
  planPanel.onMoveCargoStep = async (fromStepIndex, toAfterStepIndex) => {
    undoHistory.snapshot(getPlan())
    intentManager.moveCargoStep(fromStepIndex, toAfterStepIndex)
    await rerender()
  }
  planPanel.onMoveJourneyIntentIntoStep = async (vehicleId, fromStepIndex, toStepIndex) => {
    undoHistory.snapshot(getPlan())
    intentManager.moveJourneyIntentIntoStep(vehicleId, fromStepIndex, toStepIndex)
    await rerender()
  }
  planPanel.onConfirmPlan = () => onConfirmPlan?.()

  hudPanel.onUndo = async () => {
    const prev = undoHistory.undo(getPlan())
    if (prev) {
      intentManager.resetPlan(prev)
      await rerender()
    }
  }
  hudPanel.onRedo = async () => {
    const next = undoHistory.redo(getPlan())
    if (next) {
      intentManager.resetPlan(next)
      await rerender()
    }
  }
  hudPanel.onDownloadSnapshots = () => downloadDerivedSnapshots(getDerived())

  window.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.key === 'z') {
      hudPanel.onUndo?.()
      e.preventDefault()
    }
    if (e.ctrlKey && e.key === 'y') {
      hudPanel.onRedo?.()
      e.preventDefault()
    }
  })
}
