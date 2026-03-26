import type { Plan, CargoIntent } from '../model/types/Plan'
import type {
  DerivedPlanState,
  DerivedStep,
  DerivedJourneyStep,
  DerivedCargoStep,
  DerivedJourneyIntent,
  WorldSnapshot,
  ValidCargoActions,
} from '../model/types/DerivedPlanState'
import type { NavApi } from './navigation'
import type { TileCentersApi } from './layer_0/tile_centers_api'

function snapshotOf(
  vehiclePositions: Map<number, number>,
  crateOnGround: Map<number, number>,
  vehicleCargo: Map<number, Set<number>>,
  validCargoActions: ValidCargoActions,
): WorldSnapshot {
  return {
    vehiclePositions: new Map(vehiclePositions),
    crateOnGround: new Map(crateOnGround),
    vehicleCargo: new Map([...vehicleCargo.entries()].map(([k, v]) => [k, new Set(v)])),
    validCargoActions,
  }
}

function computeValidCargoActions(
  vehiclePositions: Map<number, number>,
  crateOnGround: Map<number, number>,
  vehicleCargo: Map<number, Set<number>>,
  plan: Plan,
  navApi: NavApi,
  tileApi: TileCentersApi,
): ValidCargoActions {
  const validLoads: ValidCargoActions['validLoads'] = []
  const validUnloads: ValidCargoActions['validUnloads'] = []
  const validDelivers: ValidCargoActions['validDelivers'] = []

  for (const [crateId] of crateOnGround) {
    for (const vehicleId of Object.keys(plan.vehicles).map(Number)) {
      const intent: CargoIntent = { kind: 'LOAD', crateId, vehicleId }
      if (checkCargoValidity(intent, plan, vehiclePositions, crateOnGround, vehicleCargo, navApi, tileApi).valid) {
        validLoads.push({ crateId, vehicleId })
      }
    }
  }

  for (const [vehicleId, crates] of vehicleCargo) {
    const vehicleTile = vehiclePositions.get(vehicleId)
    if (vehicleTile === undefined) continue
    const neighbors = navApi.getNeighbors(vehicleTile, 'ALL')
    for (const crateId of crates) {
      for (const toTileId of neighbors) {
        const intent: CargoIntent = { kind: 'UNLOAD', crateId, vehicleId, toTileId }
        if (checkCargoValidity(intent, plan, vehiclePositions, crateOnGround, vehicleCargo, navApi, tileApi).valid) {
          validUnloads.push({ crateId, vehicleId, toTileId })
        }
      }
      const crate = plan.crates[crateId]
      if (crate) {
        for (const toTileId of neighbors) {
          const tile = tileApi.getTileById(toTileId)
          if (tile?.is_land && tile.country_name === crate.destinationCountry) {
            const intent: CargoIntent = { kind: 'DELIVER', crateId, vehicleId, toTileId }
            if (checkCargoValidity(intent, plan, vehiclePositions, crateOnGround, vehicleCargo, navApi, tileApi).valid) {
              validDelivers.push({ crateId, vehicleId, toTileId })
            }
          }
        }
      }
    }
  }

  return { validLoads, validUnloads, validDelivers }
}

function checkCargoValidity(
  intent: CargoIntent,
  plan: Plan,
  vehiclePositions: Map<number, number>,
  crateOnGround: Map<number, number>,
  vehicleCargo: Map<number, Set<number>>,
  navApi: NavApi,
  tileApi: TileCentersApi,
): { valid: boolean; invalidReason?: string } {
  switch (intent.kind) {
    case 'LOAD': {
      const { crateId, vehicleId } = intent
      if (!crateOnGround.has(crateId)) return { valid: false, invalidReason: 'Crate not on ground' }
      if (!vehiclePositions.has(vehicleId)) return { valid: false, invalidReason: 'Vehicle not found' }
      const crateTile = crateOnGround.get(crateId)!
      const vehicleTile = vehiclePositions.get(vehicleId)!
      if (!navApi.getNeighbors(crateTile, 'ALL').includes(vehicleTile)) return { valid: false, invalidReason: 'Not adjacent' }
      const vehicle = plan.vehicles[vehicleId]
      if (!vehicle) return { valid: false, invalidReason: 'Vehicle not found' }
      if ((vehicleCargo.get(vehicleId)?.size ?? 0) >= vehicle.capacity) return { valid: false, invalidReason: 'Vehicle at capacity' }
      return { valid: true }
    }
    case 'UNLOAD': {
      const { crateId, vehicleId, toTileId } = intent
      if (!vehicleCargo.get(vehicleId)?.has(crateId)) return { valid: false, invalidReason: 'Crate not on vehicle' }
      const tile = tileApi.getTileById(toTileId)
      if (!tile?.is_land) return { valid: false, invalidReason: 'Target tile not on land' }
      const vehicleTile = vehiclePositions.get(vehicleId)
      if (vehicleTile === undefined) return { valid: false, invalidReason: 'Vehicle not found' }
      if (!navApi.getNeighbors(vehicleTile, 'ALL').includes(toTileId)) return { valid: false, invalidReason: 'Not adjacent' }
      const tileOccupied =
        [...vehiclePositions.values()].includes(toTileId) ||
        [...crateOnGround.values()].includes(toTileId)
      if (tileOccupied) return { valid: false, invalidReason: 'Tile occupied' }
      return { valid: true }
    }
    case 'DELIVER': {
      const { crateId, vehicleId, toTileId } = intent
      if (!vehicleCargo.get(vehicleId)?.has(crateId)) return { valid: false, invalidReason: 'Crate not on vehicle' }
      const tile = tileApi.getTileById(toTileId)
      if (!tile?.is_land) return { valid: false, invalidReason: 'Target tile not on land' }
      const crate = plan.crates[crateId]
      if (!crate) return { valid: false, invalidReason: 'Crate not found' }
      if (tile.country_name !== crate.destinationCountry) return { valid: false, invalidReason: 'Wrong destination country' }
      const vehicleTile = vehiclePositions.get(vehicleId)
      if (vehicleTile === undefined) return { valid: false, invalidReason: 'Vehicle not found' }
      if (!navApi.getNeighbors(vehicleTile, 'ALL').includes(toTileId)) return { valid: false, invalidReason: 'Not adjacent' }
      return { valid: true }
    }
  }
}

function applyCargoEffect(
  intent: CargoIntent,
  crateOnGround: Map<number, number>,
  vehicleCargo: Map<number, Set<number>>,
  deliveredCrates: Set<number>,
): void {
  switch (intent.kind) {
    case 'LOAD':
      crateOnGround.delete(intent.crateId)
      vehicleCargo.get(intent.vehicleId)?.add(intent.crateId)
      break
    case 'UNLOAD':
      vehicleCargo.get(intent.vehicleId)?.delete(intent.crateId)
      crateOnGround.set(intent.crateId, intent.toTileId)
      break
    case 'DELIVER':
      vehicleCargo.get(intent.vehicleId)?.delete(intent.crateId)
      deliveredCrates.add(intent.crateId)
      break
  }
}

function computeOccupiedTiles(plan: Plan): Set<number> {
  const tiles = new Set<number>()
  for (const tileId of Object.values(plan.initialState.vehiclePositions)) tiles.add(tileId)
  for (const tileId of Object.values(plan.initialState.cratePositions)) tiles.add(tileId)
  for (const step of plan.steps) {
    if (step.kind === 'JOURNEY') {
      for (const j of step.journeys) tiles.add(j.toTileId)
    } else {
      const a = step.action
      if (a.kind === 'UNLOAD' || a.kind === 'DELIVER') tiles.add(a.toTileId)
    }
  }
  return tiles
}

export function derivePlanState(plan: Plan, navApi: NavApi, tileApi: TileCentersApi): DerivedPlanState {
  const vehiclePositions = new Map<number, number>(
    Object.entries(plan.initialState.vehiclePositions).map(([k, v]) => [Number(k), v]),
  )
  const crateOnGround = new Map<number, number>(
    Object.entries(plan.initialState.cratePositions).map(([k, v]) => [Number(k), v]),
  )
  const vehicleCargo = new Map<number, Set<number>>(
    Object.keys(plan.vehicles).map((k) => {
      const vehicleId = Number(k)
      const initialCrates = plan.initialState.vehicleCargo[vehicleId] ?? []
      return [vehicleId, new Set<number>(initialCrates)]
    }),
  )
  const deliveredCrates = new Set<number>()

  const initialValid = computeValidCargoActions(vehiclePositions, crateOnGround, vehicleCargo, plan, navApi, tileApi)
  const initialSnapshot = snapshotOf(vehiclePositions, crateOnGround, vehicleCargo, initialValid)
  const stepSnapshots: WorldSnapshot[] = []
  const derivedSteps: DerivedStep[] = []
  let totalTraveltime = 0

  for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex++) {
    const step = plan.steps[stepIndex]

    if (step.kind === 'JOURNEY') {
      const derivedJourneys: DerivedJourneyIntent[] = []

      for (const intent of step.journeys) {
        const { vehicleId, toTileId } = intent
        const fromTile = vehiclePositions.get(vehicleId)
        let pathTileIds: number[] = []
        let traveltime = 0

        if (fromTile !== undefined) {
          const vehicle = plan.vehicles[vehicleId]
          const path = navApi.findPath(fromTile, toTileId, vehicle?.vehicleType.navMesh ?? 'ALL')
          if (path) {
            pathTileIds = path
            traveltime = (path.length - 1) * (vehicle?.movementCost ?? 1)
          }
          vehiclePositions.set(vehicleId, toTileId)
        }

        derivedJourneys.push({ ...intent, pathTileIds, traveltime })
      }

      const stepTraveltime =
        derivedJourneys.length > 0 ? Math.max(...derivedJourneys.map((j) => j.traveltime)) : 0
      totalTraveltime += stepTraveltime

      const journeyStep: DerivedJourneyStep = {
        kind: 'JOURNEY',
        stepIndex,
        journeys: derivedJourneys,
        stepTraveltime,
      }
      derivedSteps.push(journeyStep)
    } else {
      const intent = step.action
      const { valid, invalidReason } = checkCargoValidity(
        intent, plan, vehiclePositions, crateOnGround, vehicleCargo, navApi, tileApi,
      )
      if (valid) {
        applyCargoEffect(intent, crateOnGround, vehicleCargo, deliveredCrates)
      }
      const cargoStep: DerivedCargoStep = {
        kind: 'CARGO',
        stepIndex,
        action: { intent, valid, invalidReason },
      }
      derivedSteps.push(cargoStep)
    }

    const valid = computeValidCargoActions(vehiclePositions, crateOnGround, vehicleCargo, plan, navApi, tileApi)
    stepSnapshots.push(snapshotOf(vehiclePositions, crateOnGround, vehicleCargo, valid))
  }

  return {
    steps: derivedSteps,
    initialSnapshot,
    stepSnapshots,
    deliveredCrates,
    totalTraveltime,
    occupiedTiles: computeOccupiedTiles(plan),
  }
}

function intentInValidCargoActions(intent: CargoIntent, v: ValidCargoActions): boolean {
  switch (intent.kind) {
    case 'LOAD':
      return v.validLoads.some((x) => x.crateId === intent.crateId && x.vehicleId === intent.vehicleId)
    case 'UNLOAD':
      return v.validUnloads.some(
        (x) => x.crateId === intent.crateId && x.vehicleId === intent.vehicleId && x.toTileId === intent.toTileId,
      )
    case 'DELIVER':
      return v.validDelivers.some(
        (x) =>
          x.crateId === intent.crateId && x.vehicleId === intent.vehicleId && x.toTileId === intent.toTileId,
      )
  }
}

/**
 * Find the first valid insertion point for `intent` while `vehicleId` is stationary at its
 * `pinStepIndex` position (pass -1 for the vehicle's initial position).
 *
 * The dwell range is [pinStepIndex, nextJourneyStepForVehicle - 1]: the vehicle stays at the
 * same tile from when it arrives (pinStepIndex) until it moves again, so a LOAD can be inserted
 * at any step in that window where the crate has already landed on the ground.
 */
export function findFirstValidLoadInsertionInDwellRange(
  intent: CargoIntent,
  pinStepIndex: number,
  vehicleId: number,
  plan: Plan,
  derived: DerivedPlanState,
): number | null {
  // Upper bound: the step just before this vehicle moves again (exclusive).
  let nextMoveStep = plan.steps.length
  for (let i = pinStepIndex + 1; i < plan.steps.length; i++) {
    const step = plan.steps[i]
    if (step.kind === 'JOURNEY' && step.journeys.some((j) => j.vehicleId === vehicleId)) {
      nextMoveStep = i
      break
    }
  }

  if (pinStepIndex < 0) {
    if (intentInValidCargoActions(intent, derived.initialSnapshot.validCargoActions)) return -1
  }
  for (let i = Math.max(0, pinStepIndex); i < nextMoveStep; i++) {
    const snap = derived.stepSnapshots[i]
    if (snap && intentInValidCargoActions(intent, snap.validCargoActions)) return i
  }
  return null
}

export function findFirstValidInsertionPoint(
  intent: CargoIntent,
  derived: DerivedPlanState,
): number | null {
  if (intentInValidCargoActions(intent, derived.initialSnapshot.validCargoActions)) {
    return -1
  }
  for (let i = 0; i < derived.stepSnapshots.length; i++) {
    if (intentInValidCargoActions(intent, derived.stepSnapshots[i].validCargoActions)) {
      return i
    }
  }
  return null
}

/** Returns the last tile the vehicle is headed to (or its initial position). */
export function getVehicleLastTileId(plan: Plan, vehicleId: number): number | null {
  for (let i = plan.steps.length - 1; i >= 0; i--) {
    const step = plan.steps[i]
    if (step.kind !== 'JOURNEY') continue
    const j = step.journeys.find((jj) => jj.vehicleId === vehicleId)
    if (j) return j.toTileId
  }
  return plan.initialState.vehiclePositions[vehicleId] ?? null
}

/** Get the snapshot just before a given step index (or initialSnapshot if stepIndex <= 0). */
export function snapshotBefore(
  derived: DerivedPlanState,
  stepIndex: number,
): DerivedPlanState['initialSnapshot'] {
  if (stepIndex <= 0) return derived.initialSnapshot
  return derived.stepSnapshots[stepIndex - 1] ?? derived.initialSnapshot
}
