import type { Plan, CargoIntent } from '../model/types/Plan'
import type {
  DerivedPlanState,
  DerivedStep,
  DerivedJourneyStep,
  DerivedCargoStep,
  DerivedJourneyIntent,
  DerivedCargoAction,
  WorldSnapshot,
} from '../model/types/DerivedPlanState'
import type { NavApi } from './navigation'
import type { TileCentersApi } from './layer_0/tile_centers_api'

function snapshotOf(
  vehiclePositions: Map<number, number>,
  crateOnGround: Map<number, number>,
  vehicleCargo: Map<number, Set<number>>,
): WorldSnapshot {
  return {
    vehiclePositions: new Map(vehiclePositions),
    crateOnGround: new Map(crateOnGround),
    vehicleCargo: new Map([...vehicleCargo.entries()].map(([k, v]) => [k, new Set(v)])),
  }
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
    case 'TRANSFER': {
      const { crateId, fromVehicleId, toVehicleId } = intent
      if (!vehicleCargo.get(fromVehicleId)?.has(crateId)) return { valid: false, invalidReason: 'Crate not on vehicle' }
      if (!vehiclePositions.has(toVehicleId)) return { valid: false, invalidReason: 'Target vehicle not found' }
      const fromTile = vehiclePositions.get(fromVehicleId)
      const toTile = vehiclePositions.get(toVehicleId)
      if (fromTile === undefined || toTile === undefined) return { valid: false, invalidReason: 'Vehicle not found' }
      if (!navApi.getNeighbors(fromTile, 'ALL').includes(toTile)) return { valid: false, invalidReason: 'Not adjacent' }
      const toVehicle = plan.vehicles[toVehicleId]
      if (!toVehicle) return { valid: false, invalidReason: 'Target vehicle not found' }
      if ((vehicleCargo.get(toVehicleId)?.size ?? 0) >= toVehicle.capacity) return { valid: false, invalidReason: 'Target vehicle at capacity' }
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
    case 'TRANSFER':
      vehicleCargo.get(intent.fromVehicleId)?.delete(intent.crateId)
      vehicleCargo.get(intent.toVehicleId)?.add(intent.crateId)
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
      for (const action of step.actions) {
        if (action.kind === 'UNLOAD' || action.kind === 'DELIVER') {
          tiles.add(action.toTileId)
        }
      }
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
    Object.keys(plan.vehicles).map((k) => [Number(k), new Set<number>()]),
  )
  const deliveredCrates = new Set<number>()

  const initialSnapshot = snapshotOf(vehiclePositions, crateOnGround, vehicleCargo)
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
      const derivedActions: DerivedCargoAction[] = []

      for (const intent of step.actions) {
        const { valid, invalidReason } = checkCargoValidity(
          intent, plan, vehiclePositions, crateOnGround, vehicleCargo, navApi, tileApi,
        )
        if (valid) {
          applyCargoEffect(intent, crateOnGround, vehicleCargo, deliveredCrates)
        }
        derivedActions.push({ intent, valid, invalidReason })
      }

      const cargoStep: DerivedCargoStep = {
        kind: 'CARGO',
        stepIndex,
        actions: derivedActions,
      }
      derivedSteps.push(cargoStep)
    }

    stepSnapshots.push(snapshotOf(vehiclePositions, crateOnGround, vehicleCargo))
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
