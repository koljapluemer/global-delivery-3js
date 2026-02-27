import rawData from './tile_centers.jsonl?raw'

export interface TileCenter {
  tile_id: number
  x: number
  y: number
  z: number
  is_land: boolean
  country_id: string | null
  country_name: string | null
}

export class TileCentersApi {
  private tiles: TileCenter[] = []

  load(): void {
    this.tiles = rawData
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as TileCenter)
  }

  getAll(): readonly TileCenter[] {
    return this.tiles
  }

  getLandTiles(): readonly TileCenter[] {
    return this.tiles.filter((t) => t.is_land)
  }

  getWaterTiles(): readonly TileCenter[] {
    return this.tiles.filter((t) => !t.is_land)
  }

  getByCountry(countryId: string): readonly TileCenter[] {
    return this.tiles.filter((t) => t.country_id === countryId)
  }
}
