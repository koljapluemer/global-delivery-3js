import type { NavApi } from './navigation'
import type { TileCentersApi } from './layer_0/tile_centers_api'
import type { PlanIntentManager } from './plan_intent_manager'
import type { SeededRng } from '../util/seeded_rng'
import type { Crate } from '../model/types/Crate'
import { computeFairTileSet } from './fair_tiles'
import { createRandomCrate } from '../model/world_generator'

/** A crate planned for spawning — not yet added to the plan. */
export interface PlannedCrate {
  tileId: number
  crate: Crate
}

export interface CrateSpawnerDeps {
  navApi: NavApi
  tileCentersApi: TileCentersApi
  intentManager: PlanIntentManager
  rng: SeededRng
}

const MIN_CRATES = 3
const MAX_CRATES = 6

export class CrateSpawner {
  private readonly deps: CrateSpawnerDeps

  constructor(deps: CrateSpawnerDeps) {
    this.deps = deps
  }

  /**
   * Plans 2–5 crates without mutating the plan.
   * The first is always placed on a fair tile.
   * Each subsequent crate has a 50/50 chance of fair vs. any random land tile.
   * The caller is responsible for adding each crate to the plan and animating sequentially.
   */
  planBatch(): PlannedCrate[] {
    const { navApi, tileCentersApi, intentManager, rng } = this.deps
    const plan = intentManager.getPlan()
    const fairTileSet = computeFairTileSet(plan, navApi, tileCentersApi)
    const fairTileIds = [...fairTileSet.tileIds]
    const fairCountryNames = [...fairTileSet.countryNames]
    const allCountryNames = this.allCountryNames()
    const occupied = this.buildOccupied()
    const count = this.pickCount()
    const result: PlannedCrate[] = []

    for (let i = 0; i < count; i++) {
      const useFair = i === 0 || rng.next() < 0.5
      const tileId = useFair
        ? this.pickFairTile(fairTileIds, occupied)
        : this.pickRandomLandTile(occupied)

      if (tileId === null) continue

      const countries = useFair && fairCountryNames.length > 0 ? fairCountryNames : allCountryNames
      const crate = createRandomCrate(countries, rng)
      occupied.add(tileId)
      result.push({ tileId, crate })
    }

    return result
  }

  private pickCount(): number {
    return this.deps.rng.nextInt(MAX_CRATES - MIN_CRATES + 1) + MIN_CRATES
  }

  private buildOccupied(): Set<number> {
    const plan = this.deps.intentManager.getPlan()
    return new Set<number>([
      ...Object.values(plan.initialState.vehiclePositions),
      ...Object.values(plan.initialState.cratePositions),
    ])
  }

  private pickFairTile(fairTileIds: number[], occupied: Set<number>): number | null {
    const shuffled = this.shuffled(fairTileIds)
    for (const id of shuffled) {
      if (!occupied.has(id)) return id
    }
    return null
  }

  private pickRandomLandTile(occupied: Set<number>): number | null {
    const landIds = this.deps.navApi.getLargestComponentNodeIds('LAND')
    const shuffled = this.shuffled([...landIds])
    for (const id of shuffled) {
      if (!occupied.has(id)) return id
    }
    return null
  }

  private shuffled<T>(arr: T[]): T[] {
    const result = [...arr]
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.deps.rng.nextInt(i + 1)
      const tmp = result[i]
      result[i] = result[j]
      result[j] = tmp
    }
    return result
  }

  private allCountryNames(): string[] {
    const seen = new Set<string>()
    for (const tile of this.deps.tileCentersApi.getAll()) {
      if (tile.country_name) seen.add(tile.country_name)
    }
    return Array.from(seen)
  }
}
