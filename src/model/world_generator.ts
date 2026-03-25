import type { TileCentersApi } from '../controller/layer_0/tile_centers_api'
import type { NavApi } from '../controller/navigation'
import type { Plan } from './types/Plan'
import type { Crate } from './types/Crate'
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

export function emptyPlan(): Plan {
  return {
    vehicles: {},
    crates: {},
    initialState: { vehiclePositions: {}, cratePositions: {} },
    steps: [],
  }
}

/**
 * Populates the plan with 6 initial crates placed on fair tiles derived from the
 * vehicles already in the plan. Must be called AFTER vehicles have been placed.
 */
export function addInitialCrates(plan: Plan, navApi: NavApi, tileCentersApi: TileCentersApi): void {
  const fairTileSet = computeFairTileSet(plan, navApi, tileCentersApi)
  const fairLandTiles = [...fairTileSet.tileIds]
  const fairCountries = [...fairTileSet.countryNames]

  const occupied = new Set<number>([
    ...Object.values(plan.initialState.vehiclePositions),
    ...Object.values(plan.initialState.cratePositions),
  ])

  const crateTileIds: number[] = []
  while (crateTileIds.length < 6) {
    const tileId = pickRandom(fairLandTiles)
    if (!occupied.has(tileId)) {
      crateTileIds.push(tileId)
      occupied.add(tileId)
    }
  }

  const startId = Object.keys(plan.crates).length > 0
    ? Math.max(...Object.keys(plan.crates).map(Number)) + 1
    : 0

  for (let i = 0; i < 6; i++) {
    plan.crates[startId + i] = createRandomCrate(fairCountries)
    plan.initialState.cratePositions[startId + i] = crateTileIds[i]
  }
}
