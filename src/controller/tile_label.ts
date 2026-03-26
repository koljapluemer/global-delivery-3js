import type { TileCentersApi } from './layer_0/tile_centers_api'
import type { NavApi } from './navigation'

/**
 * Returns a human-readable location label for a tile.
 * Land tiles: the country name.
 * Water tiles: "off the coast of X and Y" based on adjacent land tiles, or "Open Sea".
 */
export function describeTileLocation(tileId: number, tileApi: TileCentersApi, navApi: NavApi): string {
  const tile = tileApi.getTileById(tileId)
  if (!tile) return 'Unknown'
  if (tile.is_land) return tile.country_name ?? 'Unknown'

  const neighborCountries = new Set<string>()
  for (const neighborId of navApi.getNeighbors(tileId, 'ALL')) {
    const neighbor = tileApi.getTileById(neighborId)
    if (neighbor?.is_land && neighbor.country_name) {
      neighborCountries.add(neighbor.country_name)
    }
  }

  if (neighborCountries.size === 0) return 'Open Sea'
  const countries = [...neighborCountries]
  if (countries.length === 1) return `off the coast of ${countries[0]}`
  const last = countries.pop()!
  return `off the coast of ${countries.join(', ')} and ${last}`
}
