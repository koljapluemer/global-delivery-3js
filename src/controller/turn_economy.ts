import type { GameState } from '../model/types/GameState'
import type { Plan } from '../model/types/Plan'
import type { DerivedPlanState } from '../model/types/DerivedPlanState'

export interface TurnEconomy {
  currentBudget: number
  travelCost: number
  turnFee: number
  reward: number
  afterTurn: number
}

export function deriveTurnEconomy(gameState: GameState, plan: Plan, derived: DerivedPlanState): TurnEconomy {
  const currentBudget = gameState.timecostBudget
  const travelCost = derived.totalTraveltime
  const turnFee = 100 + 25 * gameState.turnNumber

  let reward = 0
  for (const step of plan.steps) {
    if (step.kind === 'CARGO' && step.action.kind === 'DELIVER') {
      const crate = plan.crates[step.action.crateId]
      if (crate) reward += crate.rewardTimecost
    }
  }

  const afterTurn = currentBudget - travelCost - turnFee + reward
  return { currentBudget, travelCost, turnFee, reward, afterTurn }
}
