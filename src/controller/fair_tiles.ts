import type { NavApi } from './navigation'
import type { TileCentersApi } from './layer_0/tile_centers_api'
import type { Plan } from '../model/types/Plan'

export interface FairTileSet {
  tileIds: ReadonlySet<number>
  countryNames: ReadonlySet<string>
}

function getLandVehicleFairTileIds(vehicleTileId: number, navApi: NavApi): ReadonlySet<number> {
  const nodeIds = navApi.getComponentNodeIds(vehicleTileId, 'LAND')
  return nodeIds ? new Set(nodeIds) : new Set()
}

function getWaterVehicleFairTileIds(
  vehicleTileId: number,
  navApi: NavApi,
  tileApi: TileCentersApi,
): ReadonlySet<number> {
  const waterNodeIds = navApi.getComponentNodeIds(vehicleTileId, 'WATER')
  if (!waterNodeIds) return new Set()

  const coastalLandTiles = new Set<number>()
  for (const waterTileId of waterNodeIds) {
    for (const neighborId of navApi.getNeighbors(waterTileId, 'ALL')) {
      if (tileApi.getTileById(neighborId)?.is_land) {
        coastalLandTiles.add(neighborId)
      }
    }
  }
  return coastalLandTiles
}

function getFairCountryNames(tileIds: ReadonlySet<number>, tileApi: TileCentersApi): ReadonlySet<string> {
  const names = new Set<string>()
  for (const tile of tileApi.getAll()) {
    if (tileIds.has(tile.tile_id) && tile.country_name) {
      names.add(tile.country_name)
    }
  }
  return names
}

export function computeFairTileSet(plan: Plan, navApi: NavApi, tileApi: TileCentersApi): FairTileSet {
  const tileIds = new Set<number>()

  for (const [vehicleIdStr, vehicle] of Object.entries(plan.vehicles)) {
    const vehicleId = Number(vehicleIdStr)
    const vehicleTileId = plan.initialState.vehiclePositions[vehicleId]
    if (vehicleTileId === undefined) continue

    const navMesh = vehicle.vehicleType.navMesh
    const fairIds =
      navMesh === 'LAND'
        ? getLandVehicleFairTileIds(vehicleTileId, navApi)
        : navMesh === 'WATER'
          ? getWaterVehicleFairTileIds(vehicleTileId, navApi, tileApi)
          : new Set<number>()

    for (const id of fairIds) tileIds.add(id)
  }

  return { tileIds, countryNames: getFairCountryNames(tileIds, tileApi) }
}
