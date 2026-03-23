import { downloadDerivedSnapshots } from './debug_export'
import type { Plan } from '../model/types/Plan'
import type { DerivedPlanState } from '../model/types/DerivedPlanState'
import type { PlanIntentManager } from '../controller/plan_intent_manager'
import type { UndoRedoHistory } from '../controller/undo_redo'
import type { PlanPanel } from '../view/ui/plan_panel/plan_panel'
import type { HudPanel } from '../view/ui/hud_panel/hud_panel'

export interface PanelWiringDeps {
  planPanel: PlanPanel
  hudPanel: HudPanel
  intentManager: PlanIntentManager
  undoHistory: UndoRedoHistory
  rerender: () => Promise<void>
  getDerived: () => DerivedPlanState
  getPlan: () => Plan
  onConfirmPlan?: () => void
}

export function wirePanelCallbacks(deps: PanelWiringDeps): void {
  const {
    planPanel,
    hudPanel,
    intentManager,
    undoHistory,
    rerender,
    getDerived,
    getPlan,
    onConfirmPlan,
  } = deps

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
