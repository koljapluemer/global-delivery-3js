import type { Plan } from '../../../model/types/Plan'
import type { EntityTarget } from '../../../model/types/EntityTarget'
import type { TileCentersApi } from '../../../controller/layer_0/tile_centers_api'
import type { CrateInspection, InspectionContent, StepEntry, VehicleInspection } from './types'

function resolveCountry(tileId: number, tileApi: TileCentersApi): string | null {
  return tileApi.getTileById(tileId)?.country_name ?? null
}

function inspectVehicle(id: number, plan: Plan, tileApi: TileCentersApi): VehicleInspection {
  const vehicle = plan.vehicles[id]

  // Location at step 0
  let location: string | null = null
  if (plan.steps.length > 0) {
    for (const [tileIdStr, [kind, entityId]] of Object.entries(plan.steps[0].tileOccupations)) {
      if (kind === 'VEHICLE' && entityId === id) {
        location = resolveCountry(Number(tileIdStr), tileApi)
        break
      }
    }
  }

  const stepEntries: StepEntry[] = []

  for (let i = 1; i < plan.steps.length; i++) {
    const prev = plan.steps[i - 1]
    const curr = plan.steps[i]
    const label = `#${i}`

    // Vehicle moved
    let prevTile: number | undefined
    let currTile: number | undefined
    for (const [tileIdStr, [kind, entityId]] of Object.entries(prev.tileOccupations)) {
      if (kind === 'VEHICLE' && entityId === id) { prevTile = Number(tileIdStr); break }
    }
    for (const [tileIdStr, [kind, entityId]] of Object.entries(curr.tileOccupations)) {
      if (kind === 'VEHICLE' && entityId === id) { currTile = Number(tileIdStr); break }
    }
    if (currTile !== undefined && prevTile !== currTile) {
      const country = resolveCountry(currTile, tileApi) ?? 'open sea'
      stepEntries.push({ stepLabel: label, description: `Arrives in ${country}` })
    }

    // Crates loaded onto this vehicle
    for (const [crateIdStr, vehicleId] of Object.entries(curr.transportedCargo)) {
      if (vehicleId !== id) continue
      const crateId = Number(crateIdStr)
      if (crateId in prev.transportedCargo) continue
      const dest = plan.crates[crateId].destinationCountry
      stepEntries.push({ stepLabel: label, description: `Loads Crate → ${dest}` })
    }

    // Crates unloaded from this vehicle
    for (const [crateIdStr, vehicleId] of Object.entries(prev.transportedCargo)) {
      if (vehicleId !== id) continue
      const crateId = Number(crateIdStr)
      if (crateId in curr.transportedCargo) continue
      const dest = plan.crates[crateId].destinationCountry
      let unloadTile: number | undefined
      for (const [tileIdStr, [kind, entityId]] of Object.entries(curr.tileOccupations)) {
        if (kind === 'CRATE' && entityId === crateId) { unloadTile = Number(tileIdStr); break }
      }
      const country = unloadTile !== undefined ? resolveCountry(unloadTile, tileApi) ?? 'open sea' : 'open sea'
      stepEntries.push({ stepLabel: label, description: `Unloads Crate → ${dest} in ${country}` })
    }
  }

  return { kind: 'VEHICLE', name: vehicle.name, location, stepEntries }
}

function inspectCrate(id: number, plan: Plan, tileApi: TileCentersApi): CrateInspection {
  const crate = plan.crates[id]

  // Location at step 0
  let location: string | null = null
  let locationNote: string | null = null
  if (plan.steps.length > 0) {
    const step0 = plan.steps[0]
    for (const [tileIdStr, [kind, entityId]] of Object.entries(step0.tileOccupations)) {
      if (kind === 'CRATE' && entityId === id) {
        location = resolveCountry(Number(tileIdStr), tileApi)
        break
      }
    }
    if (location === null && id in step0.transportedCargo) {
      const vehicleId = step0.transportedCargo[id]
      const vehicleName = plan.vehicles[vehicleId].name
      locationNote = `aboard ${vehicleName}`
    }
  }

  const stepEntries: StepEntry[] = []

  for (let i = 1; i < plan.steps.length; i++) {
    const prev = plan.steps[i - 1]
    const curr = plan.steps[i]
    const label = `#${i}`

    // Loaded
    if (id in curr.transportedCargo && !(id in prev.transportedCargo)) {
      const vehicleId = curr.transportedCargo[id]
      const vehicleName = plan.vehicles[vehicleId].name
      stepEntries.push({ stepLabel: label, description: `Loaded onto ${vehicleName}` })
    }

    // Unloaded
    if (id in prev.transportedCargo && !(id in curr.transportedCargo)) {
      const vehicleId = prev.transportedCargo[id]
      const vehicleName = plan.vehicles[vehicleId].name
      let unloadTile: number | undefined
      for (const [tileIdStr, [kind, entityId]] of Object.entries(curr.tileOccupations)) {
        if (kind === 'CRATE' && entityId === id) { unloadTile = Number(tileIdStr); break }
      }
      const country = unloadTile !== undefined ? resolveCountry(unloadTile, tileApi) ?? 'open sea' : 'open sea'
      stepEntries.push({ stepLabel: label, description: `Unloaded in ${country} by ${vehicleName}` })
    }
  }

  return { kind: 'CRATE', destinationCountry: crate.destinationCountry, location, locationNote, stepEntries }
}

export function inspectEntity(target: EntityTarget, plan: Plan, tileApi: TileCentersApi): InspectionContent {
  if (target.kind === 'VEHICLE') return inspectVehicle(target.id, plan, tileApi)
  return inspectCrate(target.id, plan, tileApi)
}
