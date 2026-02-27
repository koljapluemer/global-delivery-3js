import type { GlobePointer } from '../../controller/globe_pointer'

export function setupLogHoveredTile(pointer: GlobePointer): void {
  pointer.onHover = (tile) => {
    if (tile) {
      console.log(`[hover] tile=${tile.tile_id} land=${tile.is_land} country=${tile.country_name ?? '—'} (${tile.x.toFixed(3)}, ${tile.y.toFixed(3)}, ${tile.z.toFixed(3)})`)
    }
  }
}
