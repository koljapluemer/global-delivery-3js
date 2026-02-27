import type { Plan } from '../../model/types/Plan'
import type { Timestep } from '../../model/types/Timestep'

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
