import type { Plan } from '../../../model/types/Plan'
import type { DerivedPlanState } from '../../../model/types/DerivedPlanState'
import type { EntityTarget } from '../../../model/types/EntityTarget'
import type { TileCentersApi } from '../../../controller/layer_0/tile_centers_api'
import type {
  CrateInspection,
  InspectionContent,
  JourneyStepEntry,
  StepEntry,
  VehicleInspection,
} from './types'

function resolveCountry(tileId: number, tileApi: TileCentersApi): string | null {
  return tileApi.getTileById(tileId)?.country_name ?? null
}

function inspectVehicle(
  id: number,
  plan: Plan,
  derived: DerivedPlanState,
  tileApi: TileCentersApi,
): VehicleInspection {
  const vehicle = plan.vehicles[id]
  const tileId = plan.initialState.vehiclePositions[id]
  const location = tileId !== undefined ? resolveCountry(tileId, tileApi) : null

  const stepEntries: StepEntry[] = []

  for (const step of derived.steps) {
    if (step.kind === 'JOURNEY') {
      const journey = step.journeys.find((j) => j.vehicleId === id)
      if (!journey) continue
      const tile = tileApi.getTileById(journey.toTileId)
      const country = tile?.country_name ?? 'open sea'
      const snap = derived.stepSnapshots[step.stepIndex]
      const onBoard = snap
        ? [...(snap.vehicleCargo.get(id) ?? [])].map((crateId) => ({
            crateId,
            label: plan.crates[crateId]?.destinationCountry ?? `Crate #${crateId}`,
          }))
        : []
      const entry: JourneyStepEntry = {
        kind: 'JOURNEY',
        stepIndex: step.stepIndex,
        vehicleId: id,
        stepLabel: `#${step.stepIndex}`,
        description: `Arrives in ${country}`,
        onBoard,
      }
      stepEntries.push(entry)
    } else {
      const { intent, valid } = step.action
      let description: string | null = null

      if (intent.kind === 'LOAD' && intent.vehicleId === id) {
        const dest = plan.crates[intent.crateId]?.destinationCountry ?? '?'
        description = `Loads Crate→${dest}`
      } else if (intent.kind === 'UNLOAD' && intent.vehicleId === id) {
        const dest = plan.crates[intent.crateId]?.destinationCountry ?? '?'
        const country = resolveCountry(intent.toTileId, tileApi) ?? 'open sea'
        description = `Unloads Crate→${dest} in ${country}`
      } else if (intent.kind === 'DELIVER' && intent.vehicleId === id) {
        const dest = plan.crates[intent.crateId]?.destinationCountry ?? '?'
        description = `Delivers Crate→${dest}`
      }

      if (description !== null) {
        stepEntries.push({
          kind: 'CARGO',
          stepIndex: step.stepIndex,
          stepLabel: `#${step.stepIndex}`,
          description,
          valid,
        })
      }
    }
  }

  return { kind: 'VEHICLE', name: vehicle?.name ?? '?', location, stepEntries }
}

function inspectCrate(
  id: number,
  plan: Plan,
  derived: DerivedPlanState,
  tileApi: TileCentersApi,
): CrateInspection {
  const crate = plan.crates[id]
  const tileId = plan.initialState.cratePositions[id]
  const location = tileId !== undefined ? resolveCountry(tileId, tileApi) : null
  const locationNote: string | null = null

  const stepEntries: StepEntry[] = []

  for (const step of derived.steps) {
    if (step.kind !== 'CARGO') continue
    const { intent, valid } = step.action
    let description: string | null = null

    if (intent.kind === 'LOAD' && intent.crateId === id) {
      const vehicleName = plan.vehicles[intent.vehicleId]?.name ?? '?'
      description = `Loaded onto ${vehicleName}`
    } else if (intent.kind === 'UNLOAD' && intent.crateId === id) {
      const vehicleName = plan.vehicles[intent.vehicleId]?.name ?? '?'
      const country = resolveCountry(intent.toTileId, tileApi) ?? 'open sea'
      description = `Unloaded in ${country} by ${vehicleName}`
    } else if (intent.kind === 'DELIVER' && intent.crateId === id) {
      const vehicleName = plan.vehicles[intent.vehicleId]?.name ?? '?'
      description = `Delivered by ${vehicleName}`
    }

    if (description !== null) {
      stepEntries.push({
        kind: 'CARGO',
        stepIndex: step.stepIndex,
        stepLabel: `#${step.stepIndex}`,
        description,
        valid,
      })
    }
  }

  return {
    kind: 'CRATE',
    destinationCountry: crate?.destinationCountry ?? '?',
    rewardMoney: crate?.rewardMoney ?? 0,
    rewardStamps: crate?.rewardStamps ?? 0,
    location,
    locationNote,
    stepEntries,
  }
}

export function inspectEntity(
  target: EntityTarget,
  plan: Plan,
  derived: DerivedPlanState,
  tileApi: TileCentersApi,
): InspectionContent {
  if (target.kind === 'VEHICLE') return inspectVehicle(target.id, plan, derived, tileApi)
  if (target.kind === 'CRATE') return inspectCrate(target.id, plan, derived, tileApi)
  throw new Error(`inspectEntity called with unhandled target kind: ${(target as EntityTarget).kind}`)
}
