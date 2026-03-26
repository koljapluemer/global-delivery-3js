import type { Plan } from '../model/types/Plan'
import type { DerivedPlanState } from '../model/types/DerivedPlanState'
import type { PlanIntentManager } from '../controller/plan_intent_manager'
import type { PlanPanel } from '../view/ui/plan_panel/plan_panel'

export interface PanelWiringDeps {
  planPanel: PlanPanel
  intentManager: PlanIntentManager
  rerender: () => Promise<void>
  getDerived: () => DerivedPlanState
  getPlan: () => Plan
  onConfirmPlan?: () => void
  onResetPlan?: () => void
  onBackToMenu?: () => void
}

export function wirePanelCallbacks(deps: PanelWiringDeps): void {
  const {
    planPanel,
    intentManager,
    rerender,
    onConfirmPlan,
    onResetPlan,
    onBackToMenu,
  } = deps

  planPanel.onRemoveJourneyIntent = async (stepIndex, vehicleId) => {
    intentManager.removeJourneyIntent(stepIndex, vehicleId)
    await rerender()
  }
  planPanel.onRemoveCargoIntent = async (stepIndex) => {
    intentManager.removeCargoIntent(stepIndex)
    await rerender()
  }
  planPanel.onMoveJourneyIntent = async (vehicleId, fromStepIndex, toStepIndex) => {
    intentManager.moveJourneyIntent(vehicleId, fromStepIndex, toStepIndex)
    await rerender()
  }
  planPanel.onMoveCargoStep = async (fromStepIndex, toAfterStepIndex) => {
    intentManager.moveCargoStep(fromStepIndex, toAfterStepIndex)
    await rerender()
  }
  planPanel.onMoveJourneyIntentIntoStep = async (vehicleId, fromStepIndex, toStepIndex) => {
    intentManager.moveJourneyIntentIntoStep(vehicleId, fromStepIndex, toStepIndex)
    await rerender()
  }
  planPanel.onConfirmPlan = () => onConfirmPlan?.()
  planPanel.onResetPlan = () => onResetPlan?.()
  planPanel.onBackToMenu = () => onBackToMenu?.()
}
