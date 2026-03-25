/**
 * Deterministic pseudo-random number generator using the mulberry32 algorithm.
 * Produces the same sequence for the same seed, enabling replayable games.
 */
export class SeededRng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6D2B79F5) >>> 0
    let z = this.state
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296
  }

  /** Returns a random integer in [0, n). Caller must ensure n > 0. */
  nextInt(n: number): number {
    return Math.floor(this.next() * n)
  }

  /** Returns a random element from arr. Caller must ensure arr.length > 0. */
  pickRandom<T>(arr: readonly T[]): T {
    return arr[this.nextInt(arr.length)]
  }
}
