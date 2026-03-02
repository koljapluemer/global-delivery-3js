import allNavRaw from '../model/db/nav/all_nav.json?raw'
import waterNavRaw from '../model/db/nav/water_nav.json?raw'
import landNavRaw from '../model/db/nav/land_nav.json?raw'

interface NavData {
  nodes: number[]
  adjacency: Record<string, number[]>
}

type NavMesh = 'WATER' | 'LAND' | 'ALL'

export class NavApi {
  private maps = new Map<NavMesh, Map<number, number[]>>()

  load(): void {
    this.maps.set('ALL', buildAdjMap(JSON.parse(allNavRaw) as NavData))
    this.maps.set('WATER', buildAdjMap(JSON.parse(waterNavRaw) as NavData))
    this.maps.set('LAND', buildAdjMap(JSON.parse(landNavRaw) as NavData))
  }

  /** Returns the direct neighbours of tileId in the given nav mesh (empty if unknown). */
  getNeighbors(tileId: number, navMesh: NavMesh): number[] {
    return this.maps.get(navMesh)?.get(tileId) ?? []
  }

  /** Returns the shortest path as an ordered list of tile IDs, or null if unreachable. */
  findPath(from: number, to: number, navMesh: NavMesh): number[] | null {
    const adj = this.maps.get(navMesh)
    if (!adj) return null
    return bfs(adj, from, to)
  }
}

function buildAdjMap(data: NavData): Map<number, number[]> {
  const map = new Map<number, number[]>()
  for (const [k, v] of Object.entries(data.adjacency)) {
    map.set(Number(k), v)
  }
  return map
}

function bfs(adj: Map<number, number[]>, start: number, end: number): number[] | null {
  if (!adj.has(start) || !adj.has(end)) return null
  if (start === end) return [start]

  const prev = new Map<number, number>([[start, -1]])
  const queue: number[] = [start]
  let head = 0

  while (head < queue.length) {
    const node = queue[head++]
    if (node === end) {
      const path: number[] = []
      let cur: number = end
      while (cur !== -1) {
        path.push(cur)
        cur = prev.get(cur)!
      }
      return path.reverse()
    }
    for (const nb of adj.get(node) ?? []) {
      if (!prev.has(nb)) {
        prev.set(nb, node)
        queue.push(nb)
      }
    }
  }
  return null
}
