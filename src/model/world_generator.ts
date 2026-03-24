import { AvailableVehicleTypes } from './db/vehicles'
import type { TileCentersApi } from '../controller/layer_0/tile_centers_api'
import type { NavApi } from '../controller/navigation'
import type { Plan } from './types/Plan'
import type { Crate } from './types/Crate'
import type { Vehicle } from './types/Vehicle'
import { computeFairTileSet } from '../controller/fair_tiles'

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const CRATE_REWARD_MIN = 50
const CRATE_REWARD_MAX = 300
const CRATE_REWARD_STEP = 50

export function createRandomCrate(countryNames: string[]): Crate {
  const numSteps = (CRATE_REWARD_MAX - CRATE_REWARD_MIN) / CRATE_REWARD_STEP
  const rewardTimecost = CRATE_REWARD_MIN + Math.floor(Math.random() * (numSteps + 1)) * CRATE_REWARD_STEP
  const destinationCountry = pickRandom(countryNames)
  return { destinationCountry, rewardTimecost }
}

export function generateWorld(tileCentersApi: TileCentersApi, navApi: NavApi): Plan {
  const landNodeIds = navApi.getLargestComponentNodeIds('LAND')
  const waterNodeIds = navApi.getLargestComponentNodeIds('WATER')

  const carType = AvailableVehicleTypes['basic_car']
  const boatType = AvailableVehicleTypes['small_boat']

  const carTileId = pickRandom(landNodeIds)
  const carTileId2 = pickRandom(landNodeIds)
  const boatTileId = pickRandom(waterNodeIds)

  const vehicles: Record<number, Vehicle> = {
    0: {
      name: 'Cabriolet',
      vehicleType: carType,
      hue: 70,
      movementCost: carType.baseMovementCost,
      capacity: carType.baseCapacity,
    },
    2: {
      name: 'Jeep',
      vehicleType: carType,
      hue: 130,
      movementCost: carType.baseMovementCost,
      capacity: carType.baseCapacity,
    },
    1: {
      name: 'Boat',
      vehicleType: boatType,
      hue: 200,
      movementCost: boatType.baseMovementCost,
      capacity: boatType.baseCapacity,
    },
  }

  const tempPlan: Plan = {
    vehicles,
    crates: {},
    initialState: { vehiclePositions: { 0: carTileId, 1: boatTileId, 2: carTileId2 }, cratePositions: {} },
    steps: [],
  }
  const fairTileSet = computeFairTileSet(tempPlan, navApi, tileCentersApi)
  const fairLandTiles = [...fairTileSet.tileIds]
  const fairCountries = [...fairTileSet.countryNames]

  const usedTiles = new Set<number>([carTileId, carTileId2, boatTileId])
  const crateTileIds: number[] = []
  while (crateTileIds.length < 6) {
    const tileId = pickRandom(fairLandTiles)
    if (!usedTiles.has(tileId)) {
      crateTileIds.push(tileId)
      usedTiles.add(tileId)
    }
  }

  const crates: Record<number, Crate> = {}
  for (let i = 0; i < 6; i++) {
    crates[i] = createRandomCrate(fairCountries)
  }

  return {
    vehicles,
    crates,
    initialState: {
      vehiclePositions: { 0: carTileId, 1: boatTileId, 2: carTileId2 },
      cratePositions: Object.fromEntries(crateTileIds.map((id, i) => [i, id])),
    },
    steps: [],
  }
}
