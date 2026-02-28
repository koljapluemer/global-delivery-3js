import type { Plan, Timestep } from '../../../model/types/Plan'
import type { Vehicle } from '../../../model/types/Vehicle'
import type { Crate } from '../../../model/types/Crate'
import type { TileCentersApi } from '../../../controller/layer_0/tile_centers_api'
import type { PlanEvent, StepSummary } from './types'

interface TileMaps {
  readonly vehicleTiles: Map<number, number>
  readonly crateTiles: Map<number, number>
}

function buildTileMaps(step: Timestep): TileMaps {
  const vehicleTiles = new Map<number, number>()
  const crateTiles = new Map<number, number>()
  for (const [tileIdStr, occupant] of Object.entries(step.tileOccupations)) {
    const tileId = Number(tileIdStr)
    if (occupant[0] === 'VEHICLE') vehicleTiles.set(occupant[1], tileId)
    else crateTiles.set(occupant[1], tileId)
  }
  return { vehicleTiles, crateTiles }
}

function resolveCountry(tileId: number, tileApi: TileCentersApi): string | null {
  return tileApi.getTileById(tileId)?.country_name ?? null
}

function deriveTransitionEvents(
  prev: Timestep,
  curr: Timestep,
  vehicles: Record<number, Vehicle>,
  crates: Record<number, Crate>,
  tileApi: TileCentersApi,
): PlanEvent[] {
  const prevMaps = buildTileMaps(prev)
  const currMaps = buildTileMaps(curr)
  const events: PlanEvent[] = []

  // Vehicle moved: tile changed between steps
  for (const [vehicleId, currTile] of currMaps.vehicleTiles) {
    if (prevMaps.vehicleTiles.get(vehicleId) === currTile) continue
    events.push({
      kind: 'VEHICLE_MOVED',
      vehicleName: vehicles[vehicleId].name,
      toCountry: resolveCountry(currTile, tileApi),
    })
  }

  // Crate loaded: crateId entered transportedCargo
  for (const [crateIdStr, vehicleId] of Object.entries(curr.transportedCargo)) {
    const crateId = Number(crateIdStr)
    if (crateId in prev.transportedCargo) continue
    events.push({
      kind: 'CRATE_LOADED',
      crateDestination: crates[crateId].destinationCountry,
      vehicleName: vehicles[vehicleId].name,
    })
  }

  // Crate unloaded: crateId left transportedCargo
  for (const [crateIdStr, vehicleId] of Object.entries(prev.transportedCargo)) {
    const crateId = Number(crateIdStr)
    if (crateId in curr.transportedCargo) continue
    const crateTile = currMaps.crateTiles.get(crateId)
    events.push({
      kind: 'CRATE_UNLOADED',
      crateDestination: crates[crateId].destinationCountry,
      vehicleName: vehicles[vehicleId].name,
      inCountry: crateTile !== undefined ? resolveCountry(crateTile, tileApi) : null,
    })
  }

  return events
}

export function derivePlanSummary(plan: Plan, tileApi: TileCentersApi): StepSummary[] {
  if (plan.steps.length === 0) return []

  const summaries: StepSummary[] = [{ stepIndex: 0, label: 'Start', events: [] }]

  for (let i = 1; i < plan.steps.length; i++) {
    summaries.push({
      stepIndex: i,
      label: `#${i}`,
      events: deriveTransitionEvents(
        plan.steps[i - 1],
        plan.steps[i],
        plan.vehicles,
        plan.crates,
        tileApi,
      ),
    })
  }

  return summaries
}
