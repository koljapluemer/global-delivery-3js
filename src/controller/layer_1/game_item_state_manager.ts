import type { Plan, Timestep } from '../../model/types/Plan'

export class GameItemStateManager {
  private readonly plan: Plan

  constructor(plan: Plan) {
    this.plan = plan
  }

  getPlan(): Plan {
    return this.plan
  }

  getStepAtIndex(i: number): Timestep {
    return this.plan.steps[i]
  }
}
