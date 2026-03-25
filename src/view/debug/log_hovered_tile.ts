import type { TileHoverCallback } from '../../controller/globe_pointer'

const DEBUG_LOG_HOVERED_TILE = true

export function wrapWithHoverLogger(inner: TileHoverCallback): TileHoverCallback {
  if (!DEBUG_LOG_HOVERED_TILE) return inner
  return (tile) => {
    if (tile) {
      console.log(`[hover] tile=${tile.tile_id} land=${tile.is_land} country=${tile.country_name ?? '—'} (${tile.x.toFixed(3)}, ${tile.y.toFixed(3)}, ${tile.z.toFixed(3)})`)
    }
    inner(tile)
  }
}
