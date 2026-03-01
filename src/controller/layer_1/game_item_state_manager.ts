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

  /** Returns the tile ID of vehicleId in the last step, or null if not found. */
  getVehicleLastTileId(vehicleId: number): number | null {
    const lastStep = this.plan.steps[this.plan.steps.length - 1]
    if (!lastStep) return null
    for (const [tileIdStr, [kind, id]] of Object.entries(lastStep.tileOccupations)) {
      if (kind === 'VEHICLE' && id === vehicleId) return Number(tileIdStr)
    }
    return null
  }

  /** Appends a new Timestep moving vehicleId to toTileId, copying all other occupants and cargo. */
  addVehicleStep(vehicleId: number, toTileId: number): void {
    const lastStep = this.plan.steps[this.plan.steps.length - 1]
    if (!lastStep) return

    const newOccupations = { ...lastStep.tileOccupations }

    // Remove vehicle from its current tile
    for (const [tileIdStr, [kind, id]] of Object.entries(newOccupations)) {
      if (kind === 'VEHICLE' && id === vehicleId) {
        delete newOccupations[Number(tileIdStr)]
        break
      }
    }

    newOccupations[toTileId] = ['VEHICLE', vehicleId]

    this.plan.steps.push({
      tileOccupations: newOccupations,
      transportedCargo: { ...lastStep.transportedCargo },
    })
  }
}
