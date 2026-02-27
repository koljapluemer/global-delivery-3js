import rawData from '../../model/db/tile_centers.jsonl?raw'

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
  private tileMap = new Map<number, TileCenter>()

  load(): void {
    this.tiles = rawData
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as TileCenter)
    this.tileMap = new Map(this.tiles.map((t) => [t.tile_id, t]))
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

  getTileById(id: number): TileCenter | undefined {
    return this.tileMap.get(id)
  }

  getByCountry(countryId: string): readonly TileCenter[] {
    return this.tiles.filter((t) => t.country_id === countryId)
  }
}
