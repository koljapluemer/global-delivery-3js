import allNavRaw from '../model/db/nav/all_nav.json?raw'
import waterNavRaw from '../model/db/nav/water_nav.json?raw'
import landNavRaw from '../model/db/nav/land_nav.json?raw'

interface NavComponent {
  component_id: number
  size: number
  node_ids: number[]
}

interface NavData {
  nodes: number[]
  adjacency: Record<string, number[]>
  components?: NavComponent[]
}

type NavMesh = 'WATER' | 'LAND' | 'ALL'

export class NavApi {
  private maps = new Map<NavMesh, Map<number, number[]>>()
  private componentsByMesh = new Map<NavMesh, NavComponent[]>()

  load(): void {
    const loadOne = (raw: string, mesh: NavMesh): void => {
      const data = JSON.parse(raw) as NavData
      this.maps.set(mesh, buildAdjMap(data))
      if (data.components) this.componentsByMesh.set(mesh, data.components)
    }
    loadOne(allNavRaw, 'ALL')
    loadOne(waterNavRaw, 'WATER')
    loadOne(landNavRaw, 'LAND')
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

  /** Returns the node IDs (tile IDs) belonging to the largest connected component of the given navmesh. */
  getLargestComponentNodeIds(navMesh: NavMesh): number[] {
    const components = this.componentsByMesh.get(navMesh) ?? []
    if (components.length === 0) return []
    const largest = components.reduce((a, b) => (a.size >= b.size ? a : b))
    return largest.node_ids
  }

  /** Returns true if the tile is a node in the given nav mesh. */
  isTileOnNavMesh(tileId: number, navMesh: NavMesh): boolean {
    return this.maps.get(navMesh)?.has(tileId) ?? false
  }

  /** Returns the node IDs of the component containing tileId in the given navmesh, or null if not found. */
  getComponentNodeIds(tileId: number, navMesh: NavMesh): number[] | null {
    const components = this.componentsByMesh.get(navMesh) ?? []
    return components.find((c) => c.node_ids.includes(tileId))?.node_ids ?? null
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
