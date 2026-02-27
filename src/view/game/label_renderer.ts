import * as THREE from 'three'
import speechBubbleUrl from '../../assets/ui/speechbubble.png?url'
import smallBubbleUrl from '../../assets/ui/small_bubble.png?url'
import type { TileCentersApi } from '../../controller/layer_0/tile_centers_api'
import type { Plan, Timestep } from '../../model/types/Plan'
import type { Crate } from '../../model/types/Crate'

/** Width of the horizon blend zone (fraction of R·|O−C|). ~6–8° of arc. */
const HORIZON_BLEND_EPSILON = 0.1
/** Rotation offset so bubble tail points toward the globe centre. */
const HORIZON_ROTATION_OFFSET = Math.PI / 2
/** Exponential-decay speed for rotation smoothing (1/s). */
const ROTATION_SMOOTH_SPEED = 10.0

interface CrateLabelData {
  worldPosition: THREE.Vector3
  destinationCountry: string
  entityId: number
}

interface LabelEntry {
  el: HTMLDivElement
  textEl: HTMLSpanElement
  worldPos: THREE.Vector3
  smoothRot: number
}

/**
 * Renders 2D speech-bubble labels for crates in screen space.
 *
 * Visibility rule:
 *   In front of horizon → bubble at projected world position, unrotated.
 *   Behind horizon      → bubble snapped to the horizon circle where the
 *                         (globe-centre → crate) ray meets it, rotated so
 *                         the tail points inward toward the globe.
 *   Near horizon        → smooth lerp between the two states.
 *
 * The speechbubble asset's pivot is its bottom-centre (the tail tip).
 * That point is always aligned to the crate's projected screen position.
 */
export class LabelRenderer {
  private readonly camera: THREE.PerspectiveCamera
  private readonly globeCenter: THREE.Vector3
  private readonly globeRadius: number
  private container: HTMLDivElement
  private labels = new Map<number, LabelEntry>()
  private pinLabels = new Map<string, LabelEntry>()

  constructor(
    camera: THREE.PerspectiveCamera,
    globeCenter: THREE.Vector3,
    globeRadius: number,
  ) {
    this.camera = camera
    this.globeCenter = globeCenter
    this.globeRadius = globeRadius
    this.container = document.createElement('div')
    Object.assign(this.container.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
    })
    document.body.appendChild(this.container)
  }

  /** Sync label set to match the provided data. Creates / updates / removes as needed. */
  setCrateLabels(data: CrateLabelData[]): void {
    const seen = new Set<number>()
    for (const item of data) {
      seen.add(item.entityId)
      if (!this.labels.has(item.entityId)) {
        const { el, textEl } = this.createBubble(item.destinationCountry)
        this.container.appendChild(el)
        this.labels.set(item.entityId, {
          el,
          textEl,
          worldPos: item.worldPosition.clone(),
          smoothRot: 0,
        })
      } else {
        const entry = this.labels.get(item.entityId)!
        entry.worldPos.copy(item.worldPosition)
        entry.textEl.textContent = '→ ' + item.destinationCountry
      }
    }
    for (const [id, entry] of this.labels) {
      if (!seen.has(id)) {
        entry.el.remove()
        this.labels.delete(id)
      }
    }
  }

  /** Build label data from a timestep and push it to the label set. */
  syncFromTimestep(timestep: Timestep, crates: Record<number, Crate>, tileApi: TileCentersApi): void {
    const data: CrateLabelData[] = []
    for (const [tileIdStr, occupant] of Object.entries(timestep.tileOccupations)) {
      if (occupant[0] !== 'CRATE') continue
      const id = occupant[1]
      const crate = crates[id]
      if (!crate) continue
      const tile = tileApi.getTileById(Number(tileIdStr))
      if (!tile) continue
      data.push({
        worldPosition: new THREE.Vector3(tile.x, tile.z, -tile.y),
        destinationCountry: crate.destinationCountry,
        entityId: id,
      })
    }
    this.setCrateLabels(data)
  }

  /** Sync pin labels to the destination tiles of every vehicle movement in the plan. */
  syncPinsFromPlan(plan: Plan, tileApi: TileCentersApi): void {
    const data: Array<{ worldPosition: THREE.Vector3; label: string; id: string }> = []

    for (let i = 1; i < plan.steps.length; i++) {
      const prevStep = plan.steps[i - 1]
      const currStep = plan.steps[i]

      const prevTileByVehicleId = new Map<number, number>()
      for (const [tileIdStr, occupant] of Object.entries(prevStep.tileOccupations)) {
        if (occupant[0] === 'VEHICLE') {
          prevTileByVehicleId.set(occupant[1], Number(tileIdStr))
        }
      }

      for (const [tileIdStr, occupant] of Object.entries(currStep.tileOccupations)) {
        if (occupant[0] !== 'VEHICLE') continue
        const tileId = Number(tileIdStr)
        const id = occupant[1]
        if (prevTileByVehicleId.get(id) === tileId) continue
        const tile = tileApi.getTileById(tileId)
        if (!tile) continue
        data.push({
          worldPosition: new THREE.Vector3(tile.x, tile.z, -tile.y),
          label: `#${i}`,
          id: `${id}-${i}`,
        })
      }
    }

    const seen = new Set<string>()
    for (const item of data) {
      seen.add(item.id)
      if (!this.pinLabels.has(item.id)) {
        const { el, textEl } = this.createSmallBubble(item.label)
        this.container.appendChild(el)
        this.pinLabels.set(item.id, { el, textEl, worldPos: item.worldPosition.clone(), smoothRot: 0, })
      }
    }
    for (const [id, entry] of this.pinLabels) {
      if (!seen.has(id)) {
        entry.el.remove()
        this.pinLabels.delete(id)
      }
    }
  }

  /** Call each frame with the elapsed time in seconds. */
  update(delta: number): void {
    for (const entry of this.labels.values()) {
      this.updateLabel(entry, delta)
    }
    for (const entry of this.pinLabels.values()) {
      this.updatePinLabel(entry)
    }
  }

  dispose(): void {
    this.container.remove()
    this.labels.clear()
    this.pinLabels.clear()
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private createBubble(destination: string): { el: HTMLDivElement; textEl: HTMLSpanElement } {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'absolute',
      width: '100px',
      height: '60px',
      backgroundImage: `url(${speechBubbleUrl})`,
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      // Reserve vertical space for the tail at the bottom
      paddingBottom: '14px',
    })

    const textEl = document.createElement('span')
    textEl.textContent = '→ ' + destination
    Object.assign(textEl.style, {
      fontSize: '10px',
      fontWeight: 'bold',
      color: '#222',
      textAlign: 'center',
      lineHeight: '1.2',
    })
    el.appendChild(textEl)
    return { el, textEl }
  }

  private createSmallBubble(label: string): { el: HTMLDivElement; textEl: HTMLSpanElement } {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'absolute',
      width: '36px',
      height: '28px',
      backgroundImage: `url(${smallBubbleUrl})`,
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: '8px',
    })
    const textEl = document.createElement('span')
    textEl.textContent = label
    Object.assign(textEl.style, {
      fontSize: '9px',
      fontWeight: 'bold',
      color: '#222',
      textAlign: 'center',
      lineHeight: '1',
    })
    el.appendChild(textEl)
    return { el, textEl }
  }

  /**
   * Compute final 2D position and rotation for one label, then apply to the DOM element.
   *
   * The element is positioned with its bottom-centre at the target screen point:
   *   transform-origin: 50% 100%
   *   transform: translateX(-50%) translateY(-100%) rotate(angle)
   * So the tail tip stays pinned and rotation sweeps the bubble around that point.
   */
  private updateLabel(entry: LabelEntry, delta: number): void {
    const screen = this.worldToScreen(entry.worldPos)
    const blend = this.getHorizonBlend(entry.worldPos)

    let finalX = screen.x
    let finalY = screen.y
    let targetRot = 0

    if (blend > 0) {
      const globeSc = this.worldToScreen(this.globeCenter)
      const globeV2 = new THREE.Vector2(globeSc.x, globeSc.y)
      const anchorV2 = new THREE.Vector2(screen.x, screen.y)
      const horizonPt = this.horizonIntersection(globeV2, anchorV2)

      finalX = THREE.MathUtils.lerp(screen.x, horizonPt.x, blend)
      finalY = THREE.MathUtils.lerp(screen.y, horizonPt.y, blend)

      const outX = finalX - globeSc.x
      const outY = finalY - globeSc.y
      if (outX * outX + outY * outY > 1e-4) {
        targetRot = Math.atan2(outY, outX) + HORIZON_ROTATION_OFFSET
      }
    }

    // Exponential-decay smooth rotation (ported from Godot lerp_angle)
    entry.smoothRot = lerpAngle(
      entry.smoothRot,
      targetRot,
      1 - Math.exp(-delta * ROTATION_SMOOTH_SPEED),
    )

    const { el, textEl, smoothRot } = entry
    el.style.left = `${finalX}px`
    el.style.top = `${finalY}px`
    el.style.transformOrigin = '50% 100%'
    el.style.transform = `translateX(-50%) translateY(-100%) rotate(${smoothRot}rad)`

    // Keep inner text upright when the bubble is rotated past ±90°
    textEl.style.transform = Math.cos(smoothRot) < 0 ? 'rotate(180deg)' : ''
  }

  /** Position a pin label at its projected screen point, hidden when behind the horizon. */
  private updatePinLabel(entry: LabelEntry): void {
    const blend = this.getHorizonBlend(entry.worldPos)
    entry.el.style.opacity = blend >= 1 ? '0' : String(1 - blend)
    if (blend >= 1) return

    const screen = this.worldToScreen(entry.worldPos)
    entry.el.style.left = `${screen.x}px`
    entry.el.style.top = `${screen.y}px`
    entry.el.style.transformOrigin = '50% 100%'
    entry.el.style.transform = 'translateX(-50%) translateY(-100%)'
  }

  /** Project a world position to pixel coordinates. Rounded to suppress subpixel jitter. */
  private worldToScreen(pos: THREE.Vector3): { x: number; y: number } {
    const ndc = pos.clone().project(this.camera)
    return {
      x: Math.round(((ndc.x + 1) / 2) * window.innerWidth),
      y: Math.round(((-ndc.y + 1) / 2) * window.innerHeight),
    }
  }

  /**
   * Returns 0 when anchor is clearly in front of the horizon, 1 when clearly behind.
   * Port of Godot's _get_horizon_blend().
   */
  private getHorizonBlend(anchor: THREE.Vector3): number {
    const C = this.globeCenter
    const O = this.camera.position
    const R = this.globeRadius
    // signed > 0  →  in front; signed < 0  →  behind
    const signed = anchor.clone().sub(C).dot(O.clone().sub(C)) - R * R
    const zone = R * C.distanceTo(O) * HORIZON_BLEND_EPSILON
    if (zone < 1e-4) return signed >= 0 ? 0 : 1
    return smoothstep(zone, -zone, signed)
  }

  /**
   * Screen-space horizon circle { center, radius }.
   * Port of Godot's _get_horizon_circle().
   */
  private getHorizonCircle(): { center: THREE.Vector2; radius: number } {
    const C = this.globeCenter
    const O = this.camera.position
    const R = this.globeRadius
    const CO = C.clone().sub(O)
    const distSq = CO.lengthSq()
    if (distSq <= R * R) {
      const c = this.worldToScreen(C)
      return { center: new THREE.Vector2(c.x, c.y), radius: 1 }
    }
    // 3-D horizon circle centre and radius
    const C_h = C.clone().sub(CO.clone().multiplyScalar(R * R / distSq))
    const r_h = R * Math.sqrt(1 - (R * R) / distSq)
    // Sample a point on the horizon circle to get the screen-space radius
    const CONorm = CO.clone().normalize()
    let perp = new THREE.Vector3().crossVectors(CONorm, new THREE.Vector3(0, 1, 0))
    if (perp.lengthSq() < 0.01) {
      perp = new THREE.Vector3().crossVectors(CONorm, new THREE.Vector3(0, 0, 1))
    }
    perp.normalize()
    const P_h = C_h.clone().addScaledVector(perp, r_h)
    const centerSc = this.worldToScreen(C)
    const edgeSc = this.worldToScreen(P_h)
    const center = new THREE.Vector2(centerSc.x, centerSc.y)
    const radius = center.distanceTo(new THREE.Vector2(edgeSc.x, edgeSc.y))
    return { center, radius }
  }

  /**
   * Returns the point where the ray from `origin` through `target` intersects
   * the screen-space horizon circle.
   * Port of Godot's _horizon_intersection().
   */
  private horizonIntersection(origin: THREE.Vector2, target: THREE.Vector2): THREE.Vector2 {
    const { center: c, radius: r } = this.getHorizonCircle()
    const dir = target.clone().sub(origin)
    const dirLen = dir.length()
    if (dirLen < 1e-4) {
      const fallback = origin.clone().sub(c)
      const normalized =
        fallback.lengthSq() > 1e-8 ? fallback.normalize() : new THREE.Vector2(1, 0)
      return c.clone().add(normalized.multiplyScalar(r))
    }
    dir.divideScalar(dirLen)
    const oc = origin.clone().sub(c)
    const b = 2 * oc.dot(dir)
    const disc = b * b - 4 * (oc.lengthSq() - r * r)
    if (disc < 0) {
      return c.clone().add(target.clone().sub(c).normalize().multiplyScalar(r))
    }
    const sq = Math.sqrt(disc)
    const t0 = (-b - sq) * 0.5
    const t1 = (-b + sq) * 0.5
    const t = t0 > 0 ? t0 : t1
    return origin.clone().addScaledVector(dir, t)
  }
}

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Lerp between two angles taking the shortest path. */
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}
