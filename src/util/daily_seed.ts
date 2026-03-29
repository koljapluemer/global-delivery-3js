export function dailySeed(): number {
  return Math.floor(Date.now() / 86400000)
}
