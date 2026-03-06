export interface LevelStats {
  cratesDelivered: number
  pathTilesTraversed: number
  moneyEarned: number
  stampsEarned: number
}

export function emptyLevelStats(): LevelStats {
  return { cratesDelivered: 0, pathTilesTraversed: 0, moneyEarned: 0, stampsEarned: 0 }
}
