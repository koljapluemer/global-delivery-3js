export interface LevelStats {
  cratesDelivered: number
  timecostEarned: number
}

export function emptyLevelStats(): LevelStats {
  return { cratesDelivered: 0, timecostEarned: 0 }
}
