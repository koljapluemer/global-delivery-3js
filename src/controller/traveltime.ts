import type { DerivedPlanState } from '../model/types/DerivedPlanState'

export interface RouteLeg {
  vehicleId: number
  stepIndex: number
  pathTileIds: number[]
  traveltime: number
  isCounted: boolean
}

export function deriveRouteLegs(derived: DerivedPlanState): RouteLeg[] {
  const legs: RouteLeg[] = []
  for (const step of derived.steps) {
    if (step.kind !== 'JOURNEY') continue
    const maxTraveltime = step.stepTraveltime
    for (const j of step.journeys) {
      legs.push({
        vehicleId: j.vehicleId,
        stepIndex: step.stepIndex,
        pathTileIds: j.pathTileIds,
        traveltime: j.traveltime,
        isCounted: j.traveltime === maxTraveltime,
      })
    }
  }
  return legs
}

export function deriveTotalTraveltimeUsed(derived: DerivedPlanState): number {
  return derived.totalTraveltime
}
