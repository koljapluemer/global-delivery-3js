import type { Plan } from '../../model/types/Plan'
import type { Timestep } from '../../model/types/Timestep'

export class GameItemStateManager {
  constructor(private readonly plan: Plan) {}

  getPlan(): Plan {
    return this.plan
  }

  getStepAtIndex(i: number): Timestep {
    return this.plan.steps[i]
  }
}
