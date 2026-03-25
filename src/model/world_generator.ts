import type { Plan } from './types/Plan'
import type { Crate } from './types/Crate'
import type { SeededRng } from '../util/seeded_rng'

const CRATE_REWARD_MIN = 50
const CRATE_REWARD_MAX = 300
const CRATE_REWARD_STEP = 50

export function createRandomCrate(countryNames: string[], rng: SeededRng): Crate {
  const numSteps = (CRATE_REWARD_MAX - CRATE_REWARD_MIN) / CRATE_REWARD_STEP
  const rewardTimecost = CRATE_REWARD_MIN + rng.nextInt(numSteps + 1) * CRATE_REWARD_STEP
  const destinationCountry = rng.pickRandom(countryNames)
  const remainingLifetime = rng.nextInt(5) + 1
  return { destinationCountry, rewardTimecost, remainingLifetime }
}

export function emptyPlan(): Plan {
  return {
    vehicles: {},
    crates: {},
    initialState: { vehiclePositions: {}, cratePositions: {}, vehicleCargo: {} },
    steps: [],
  }
}
