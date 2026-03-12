import * as THREE from 'three'
import speechBubbleUrl from '../../assets/ui/speechbubble.png?url'
import smallBubbleUrl from '../../assets/ui/small_bubble.png?url'
import vehicleBubbleSvgRaw from '../../assets/ui/vehicle_bubble.svg?raw'
import type { TileCentersApi } from '../../controller/layer_0/tile_centers_api'
import type { Plan } from '../../model/types/Plan'
import type { EntityTarget } from '../../model/types/EntityTarget'
import type { RouteLeg } from '../../controller/traveltime'
import { hsvColor } from './color_utils'

/** Width of the horizon blend zone (fraction of R·|O−C|). ~6–8° of arc. */
const HORIZON_BLEND_EPSILON = 0.1
/** Rotation offset so bubble tail points toward the globe centre. */
const HORIZON_ROTATION_OFFSET = Math.PI / 2
/** Exponential-decay speed for rotation smoothing (1/s). */
const ROTATION_SMOOTH_SPEED = 10.0

interface CrateLabelData {
  worldPosition: THREE.Vector3
  destinationCountry: string
  rewardMoney: number
  rewardStamps: number
  entityId: number
}

interface VehicleLabelData {
  worldPosition: THREE.Vector3
  vehicleName: string
  hue: number
  entityId: number
}

interface LabelEntry {
  el: HTMLDivElement
  textEl: HTMLSpanElement
  worldPos: THREE.Vector3
  smoothRot: number
  id?: string
}

interface RouteLegLabelEntry {
  el: HTMLDivElement
  worldPos: THREE.Vector3
  opacity: number
}

/**
 * Renders 2D speech-bubble labels for crates in screen space.
 */
export class LabelRenderer {
  private readonly camera: THREE.PerspectiveCamera
  private readonly globeCenter: THREE.Vector3
  private readonly globeRadius: number
  onEntityClick: ((target: EntityTarget, worldPosition: THREE.Vector3) => void) | null = null
  onLocateCountry: ((countryName: string, nearHint: THREE.Vector3) => void) | null = null
  private container: HTMLDivElement
  private labels = new Map<number, LabelEntry>()
  private vehicleLabels = new Map<number, LabelEntry>()
  private pinLabels = new Map<string, LabelEntry>()
  private pinLabelOffsets = new Map<string, number>()
  private routeLegLabels = new Map<string, RouteLegLabelEntry>()

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
        const { el, textEl, locateBtn } = this.createBubble(item.destinationCountry, item.rewardMoney, item.rewardStamps)
        this.container.appendChild(el)
        const entry: LabelEntry = {
          el,
          textEl,
          worldPos: item.worldPosition.clone(),
          smoothRot: 0,
        }
        this.labels.set(item.entityId, entry)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          this.onEntityClick?.({ kind: 'CRATE', id: item.entityId }, entry.worldPos.clone())
        })
        locateBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          this.onLocateCountry?.(item.destinationCountry, entry.worldPos.clone())
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

  /** Build crate label data from plan.initialState and push it to the label set. */
  syncCrateLabels(plan: Plan, tileApi: TileCentersApi): void {
    const data: CrateLabelData[] = []
    for (const [crateIdStr, tileId] of Object.entries(plan.initialState.cratePositions)) {
      const id = Number(crateIdStr)
      const crate = plan.crates[id]
      if (!crate) continue
      const tile = tileApi.getTileById(tileId)
      if (!tile) continue
      data.push({
        worldPosition: new THREE.Vector3(tile.x, tile.z, -tile.y),
        destinationCountry: crate.destinationCountry,
        rewardMoney: crate.rewardMoney,
        rewardStamps: crate.rewardStamps,
        entityId: id,
      })
    }
    this.setCrateLabels(data)
  }

  /** Sync vehicle bubble labels. Creates / updates / removes as needed. */
  syncVehicleLabelsData(data: VehicleLabelData[]): void {
    const seen = new Set<number>()
    for (const item of data) {
      seen.add(item.entityId)
      if (!this.vehicleLabels.has(item.entityId)) {
        const { el, textEl } = this.createVehicleBubble(item.vehicleName, item.hue)
        this.container.appendChild(el)
        const entry: LabelEntry = {
          el,
          textEl,
          worldPos: item.worldPosition.clone(),
          smoothRot: 0,
        }
        this.vehicleLabels.set(item.entityId, entry)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          this.onEntityClick?.({ kind: 'VEHICLE', id: item.entityId }, entry.worldPos.clone())
        })
      } else {
        const entry = this.vehicleLabels.get(item.entityId)!
        entry.worldPos.copy(item.worldPosition)
      }
    }
    for (const [id, entry] of this.vehicleLabels) {
      if (!seen.has(id)) {
        entry.el.remove()
        this.vehicleLabels.delete(id)
      }
    }
  }

  /** Build vehicle label data from plan.initialState and push it to the vehicle label set. */
  syncVehicleLabels(plan: Plan, tileApi: TileCentersApi): void {
    const data: VehicleLabelData[] = []
    for (const [vehicleIdStr, tileId] of Object.entries(plan.initialState.vehiclePositions)) {
      const id = Number(vehicleIdStr)
      const vehicle = plan.vehicles[id]
      if (!vehicle) continue
      const tile = tileApi.getTileById(tileId)
      if (!tile) continue
      data.push({
        worldPosition: new THREE.Vector3(tile.x, tile.z, -tile.y),
        vehicleName: vehicle.name,
        hue: vehicle.hue,
        entityId: id,
      })
    }
    this.syncVehicleLabelsData(data)
  }

  /** Sync pin labels to the destination tiles of every vehicle journey in the plan. */
  syncPinsFromPlan(plan: Plan, tileApi: TileCentersApi): void {
    const data: Array<{ worldPosition: THREE.Vector3; label: string; id: string; vehicleId: number }> = []

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]
      if (step.kind !== 'JOURNEY') continue
      for (const journey of step.journeys) {
        const { vehicleId, toTileId } = journey
        const tile = tileApi.getTileById(toTileId)
        if (!tile) continue
        data.push({
          worldPosition: new THREE.Vector3(tile.x, tile.z, -tile.y),
          label: `#${i}`,
          id: `${vehicleId}-${i}`,
          vehicleId,
        })
      }
    }

    const seen = new Set<string>()
    for (const item of data) {
      seen.add(item.id)
      if (!this.pinLabels.has(item.id)) {
        const { el, textEl } = this.createSmallBubble(item.label)
        el.style.transition = 'transform 0.2s ease'
        this.container.appendChild(el)
        const worldPos = item.worldPosition.clone()
        this.pinLabels.set(item.id, { el, textEl, worldPos, smoothRot: 0, id: item.id })
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          this.onEntityClick?.({ kind: 'VEHICLE', id: item.vehicleId }, worldPos.clone())
        })
      } else {
        this.pinLabels.get(item.id)!.worldPos.copy(item.worldPosition)
      }
    }
    for (const [id, entry] of this.pinLabels) {
      if (!seen.has(id)) {
        entry.el.remove()
        this.pinLabels.delete(id)
      }
    }
  }

  /** Sync traveltime chip labels for all route legs. */
  syncRouteLegLabels(legs: RouteLeg[], tileApi: TileCentersApi): void {
    const seen = new Set<string>()
    for (const leg of legs) {
      const key = `${leg.vehicleId}-${leg.stepIndex}`
      seen.add(key)

      const midTileId = leg.pathTileIds[Math.floor(leg.pathTileIds.length / 2)]
      const tile = tileApi.getTileById(midTileId)
      if (!tile) continue

      const worldPos = new THREE.Vector3(tile.x, tile.z, -tile.y)
      const opacity = leg.isCounted ? 1 : 0.35

      if (!this.routeLegLabels.has(key)) {
        const el = this.createRouteLegChip(leg.traveltime)
        this.container.appendChild(el)
        this.routeLegLabels.set(key, { el, worldPos, opacity })
      } else {
        const entry = this.routeLegLabels.get(key)!
        entry.worldPos.copy(worldPos)
        entry.opacity = opacity
        entry.el.style.opacity = String(opacity)
        const span = entry.el.querySelector('span')
        if (span) span.textContent = `⏱ ${leg.traveltime}`
      }
    }
    for (const [key, entry] of this.routeLegLabels) {
      if (!seen.has(key)) {
        entry.el.remove()
        this.routeLegLabels.delete(key)
      }
    }
  }

  /** Animate a pin label upward by offsetPx when a context menu is open (0 to reset). */
  setPinLabelOffset(vehicleId: number, stepIndex: number, offsetPx: number): void {
    const key = `${vehicleId}-${stepIndex}`
    if (offsetPx === 0) this.pinLabelOffsets.delete(key)
    else this.pinLabelOffsets.set(key, offsetPx)
  }

  /** Call each frame with the elapsed time in seconds. */
  update(delta: number): void {
    for (const entry of this.labels.values()) {
      this.updateLabel(entry, delta)
    }
    for (const entry of this.vehicleLabels.values()) {
      this.updateLabel(entry, delta)
    }
    for (const [id, entry] of this.pinLabels) {
      this.updatePinLabel(entry, id)
    }
    for (const entry of this.routeLegLabels.values()) {
      this.updateRouteLegLabel(entry)
    }
  }

  dispose(): void {
    this.container.remove()
    this.labels.clear()
    this.vehicleLabels.clear()
    this.pinLabels.clear()
    this.routeLegLabels.clear()
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private createBubble(destination: string, rewardMoney: number, rewardStamps: number): { el: HTMLDivElement; textEl: HTMLSpanElement; locateBtn: HTMLButtonElement } {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'absolute',
      width: '100px',
      height: '68px',
      backgroundImage: `url(${speechBubbleUrl})`,
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: '14px',
      gap: '2px',
      pointerEvents: 'auto',
      cursor: 'pointer',
    })

    const locateBtn = document.createElement('button')
    locateBtn.title = 'Locate country'
    locateBtn.textContent = '🎯'
    Object.assign(locateBtn.style, {
      position: 'absolute',
      top: '4px',
      right: '4px',
      width: '16px',
      height: '16px',
      padding: '0',
      fontSize: '10px',
      lineHeight: '16px',
      textAlign: 'center',
      background: 'rgba(255,255,255,0.6)',
      border: 'none',
      borderRadius: '50%',
      cursor: 'pointer',
      pointerEvents: 'auto',
    })
    el.appendChild(locateBtn)

    const textEl = document.createElement('span')
    textEl.textContent = '→ ' + destination
    Object.assign(textEl.style, {
      fontSize: '10px',
      fontWeight: 'bold',
      color: '#222',
      textAlign: 'center',
      lineHeight: '1.2',
    })

    const rewardEl = document.createElement('span')
    rewardEl.textContent = `$${rewardMoney}  ★${rewardStamps}`
    Object.assign(rewardEl.style, {
      fontSize: '8px',
      color: '#444',
      textAlign: 'center',
      lineHeight: '1',
    })

    el.appendChild(textEl)
    el.appendChild(rewardEl)
    return { el, textEl, locateBtn }
  }

  private createVehicleBubble(vehicleName: string, hue: number): { el: HTMLDivElement; textEl: HTMLSpanElement } {
    const hexColor = `#${hsvColor(hue).getHexString()}`
    const coloredSvg = vehicleBubbleSvgRaw
      .replace('#4CAF50', hexColor)
      .replace('fill="#f8fafc"', 'fill="none"')
    const dataUrl = `data:image/svg+xml,${encodeURIComponent(coloredSvg)}`

    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'absolute',
      width: '120px',
      height: '65px',
      backgroundImage: `url("${dataUrl}")`,
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: '14px',
      paddingBottom: '18px',
      pointerEvents: 'auto',
      cursor: 'pointer',
    })

    const textEl = document.createElement('span')
    textEl.textContent = vehicleName
    Object.assign(textEl.style, {
      fontSize: '10px',
      fontWeight: 'bold',
      color: '#222',
      textAlign: 'center',
      lineHeight: '1.2',
      pointerEvents: 'none',
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
      pointerEvents: 'auto',
      cursor: 'pointer',
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

  private createRouteLegChip(traveltime: number): HTMLDivElement {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'absolute',
      background: 'rgba(20,20,28,0.85)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: '10px',
      padding: '2px 7px',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    })
    const span = document.createElement('span')
    span.textContent = `⏱ ${traveltime}`
    Object.assign(span.style, {
      fontSize: '10px',
      color: '#e0e0e0',
    })
    el.appendChild(span)
    return el
  }

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

    textEl.style.transform = Math.cos(smoothRot) < 0 ? 'rotate(180deg)' : ''
  }

  private updatePinLabel(entry: LabelEntry, id: string): void {
    const blend = this.getHorizonBlend(entry.worldPos)
    entry.el.style.opacity = blend >= 1 ? '0' : String(1 - blend)
    if (blend >= 1) return

    const screen = this.worldToScreen(entry.worldPos)
    entry.el.style.left = `${screen.x}px`
    entry.el.style.top = `${screen.y}px`
    entry.el.style.transformOrigin = '50% 100%'
    const offset = this.pinLabelOffsets.get(id) ?? 0
    entry.el.style.transform = offset > 0
      ? `translateX(-50%) translateY(calc(-100% - ${offset}px))`
      : 'translateX(-50%) translateY(-100%)'
  }

  private updateRouteLegLabel(entry: RouteLegLabelEntry): void {
    const blend = this.getHorizonBlend(entry.worldPos)
    const baseOpacity = blend >= 1 ? 0 : entry.opacity * (1 - blend)
    entry.el.style.opacity = String(baseOpacity)
    if (blend >= 1) return

    const screen = this.worldToScreen(entry.worldPos)
    entry.el.style.left = `${screen.x}px`
    entry.el.style.top = `${screen.y}px`
    entry.el.style.transform = 'translateX(-50%) translateY(-50%)'
  }

  private worldToScreen(pos: THREE.Vector3): { x: number; y: number } {
    const ndc = pos.clone().project(this.camera)
    return {
      x: Math.round(((ndc.x + 1) / 2) * window.innerWidth),
      y: Math.round(((-ndc.y + 1) / 2) * window.innerHeight),
    }
  }

  private getHorizonBlend(anchor: THREE.Vector3): number {
    const C = this.globeCenter
    const O = this.camera.position
    const R = this.globeRadius
    const signed = anchor.clone().sub(C).dot(O.clone().sub(C)) - R * R
    const zone = R * C.distanceTo(O) * HORIZON_BLEND_EPSILON
    if (zone < 1e-4) return signed >= 0 ? 0 : 1
    return smoothstep(zone, -zone, signed)
  }

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
    const C_h = C.clone().sub(CO.clone().multiplyScalar(R * R / distSq))
    const r_h = R * Math.sqrt(1 - (R * R) / distSq)
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

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}
