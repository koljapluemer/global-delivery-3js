import type { Plan } from '../model/types/Plan'
import type { NavApi } from './navigation'

export interface RouteLeg {
  vehicleId: number
  stepIndex: number
  pathTileIds: number[]
  traveltime: number
  isCounted: boolean
}

/** Derives route leg data for all vehicle movements in the plan.
 *  For each step, the leg with the highest traveltime is marked isCounted=true.
 *  Ties are resolved by marking all tied legs as counted. */
export function deriveRouteLegs(plan: Plan, navApi: NavApi): RouteLeg[] {
  const allLegs: RouteLeg[] = []

  for (let i = 1; i < plan.steps.length; i++) {
    const prevStep = plan.steps[i - 1]
    const currStep = plan.steps[i]

    const prevPositions = new Map<number, number>()
    for (const [tileStr, occ] of Object.entries(prevStep.tileOccupations)) {
      if (occ[0] === 'VEHICLE') prevPositions.set(occ[1], Number(tileStr))
    }
    const currPositions = new Map<number, number>()
    for (const [tileStr, occ] of Object.entries(currStep.tileOccupations)) {
      if (occ[0] === 'VEHICLE') currPositions.set(occ[1], Number(tileStr))
    }

    const stepLegs: RouteLeg[] = []

    for (const [vehicleIdStr, vehicle] of Object.entries(plan.vehicles)) {
      const vehicleId = Number(vehicleIdStr)
      const fromTile = prevPositions.get(vehicleId)
      const toTile = currPositions.get(vehicleId)
      if (fromTile === undefined || toTile === undefined || fromTile === toTile) continue

      const path = navApi.findPath(fromTile, toTile, vehicle.vehicleType.navMesh)
      if (!path || path.length < 2) continue

      const traveltime = (path.length - 1) * vehicle.movementCost
      stepLegs.push({ vehicleId, stepIndex: i, pathTileIds: path, traveltime, isCounted: false })
    }

    if (stepLegs.length > 0) {
      const maxTraveltime = Math.max(...stepLegs.map((l) => l.traveltime))
      for (const leg of stepLegs) {
        leg.isCounted = leg.traveltime === maxTraveltime
      }
    }

    allLegs.push(...stepLegs)
  }

  return allLegs
}

/** Sums the max traveltime per step across all steps. */
export function deriveTotalTraveltimeUsed(plan: Plan, navApi: NavApi): number {
  const legs = deriveRouteLegs(plan, navApi)
  return legs.filter((l) => l.isCounted).reduce((sum, l) => sum + l.traveltime, 0)
}
