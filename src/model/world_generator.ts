import { AvailableVehicleTypes } from './db/vehicles'
import type { TileCentersApi } from '../controller/layer_0/tile_centers_api'
import type { NavApi } from '../controller/navigation'
import type { Plan } from './types/Plan'
import type { Crate } from './types/Crate'
import type { Vehicle } from './types/Vehicle'

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function uniqueCountryNames(tileApi: TileCentersApi): string[] {
  const seen = new Set<string>()
  for (const tile of tileApi.getAll()) {
    if (tile.country_name) seen.add(tile.country_name)
  }
  return Array.from(seen)
}

export function generateWorld(tileCentersApi: TileCentersApi, navApi: NavApi): Plan {
  const landNodeIds = navApi.getLargestComponentNodeIds('LAND')
  const waterNodeIds = navApi.getLargestComponentNodeIds('WATER')
  const countryNames = uniqueCountryNames(tileCentersApi)

  const carType = AvailableVehicleTypes['basic_car']
  const boatType = AvailableVehicleTypes['small_boat']

  const carTileId = pickRandom(landNodeIds)
  const boatTileId = pickRandom(waterNodeIds)

  const usedTiles = new Set<number>([carTileId, boatTileId])
  const crateTileIds: number[] = []
  while (crateTileIds.length < 6) {
    const tileId = pickRandom(landNodeIds)
    if (!usedTiles.has(tileId)) {
      crateTileIds.push(tileId)
      usedTiles.add(tileId)
    }
  }

  const vehicles: Record<number, Vehicle> = {
    0: {
      name: 'Car',
      vehicleType: carType,
      hue: 70,
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

  const crates: Record<number, Crate> = {}
  for (let i = 0; i < 6; i++) {
    const rewardMoney = (Math.floor(Math.random() * 20) + 1) * 50
    const rewardStamps = Math.floor(Math.random() * 5) + 1
    const destinationCountry = pickRandom(countryNames)
    crates[i] = { destinationCountry, rewardMoney, rewardStamps }
  }

  const tileOccupations: Record<number, ['VEHICLE' | 'CRATE', number]> = {
    [carTileId]: ['VEHICLE', 0],
    [boatTileId]: ['VEHICLE', 1],
  }
  for (let i = 0; i < 6; i++) {
    tileOccupations[crateTileIds[i]] = ['CRATE', i]
  }

  return {
    vehicles,
    crates,
    steps: [{ tileOccupations, transportedCargo: {} }],
  }
}
