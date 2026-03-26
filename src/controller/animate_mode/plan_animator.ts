import * as THREE from 'three'
import type { Plan } from '../../model/types/Plan'
import type { DerivedPlanState, DerivedJourneyStep, DerivedCargoStep } from '../../model/types/DerivedPlanState'
import type { TileCentersApi } from '../layer_0/tile_centers_api'
import type { LevelStats } from '../../model/types/LevelStats'
import type { AnimateRenderer } from '../../view/game/animate_renderer'
import type { GameEvent } from '../../model/types/GameEvent'
import { emptyLevelStats } from '../../model/types/LevelStats'

/** Duration for animating a single tile step in seconds. */
const SECONDS_PER_TILE = 0.12
/** Duration for cargo load/unload/deliver animation in seconds. */
const CARGO_ANIM_SECONDS = 0.3
/** Time to wait after panning to the tracked vehicle before starting a journey step. */
const PRE_STEP_PAN_WAIT = 0.4

export interface PlanAnimatorRunOptions {
  plan: Plan
  derived: DerivedPlanState
  tileApi: TileCentersApi
  globeCenter: THREE.Vector3
  animRenderer: AnimateRenderer
  onTrackTile?: (tileId: number) => void
  onEvent?: (event: GameEvent) => void
}

/**
 * Sequences through a derived plan step-by-step, animating vehicle and crate movements.
 * Driven by tick() calls from the render loop.
 */
export class PlanAnimator {
  private tickResolves: Array<() => void> = []
  private accumulatedDelta = 0

  /** Called each frame by the render loop with the delta time in seconds. */
  tick(delta: number): void {
    this.accumulatedDelta += delta
    const cbs = this.tickResolves.splice(0)
    for (const cb of cbs) cb()
  }

  /** Awaits until at least `seconds` of real time have elapsed (via tick calls). */
  private waitSeconds(seconds: number): Promise<void> {
    const target = this.accumulatedDelta + seconds
    return new Promise((resolve) => {
      const check = () => {
        if (this.accumulatedDelta >= target) {
          resolve()
        } else {
          this.tickResolves.push(check)
        }
      }
      this.tickResolves.push(check)
    })
  }

  /**
   * Animate a vehicle along a path of tile IDs, lerping between tile world positions.
   * Returns the total path tiles traversed (excluding the starting tile).
   */
  private async animateVehicleAlongPath(
    vehicleId: number,
    pathTileIds: number[],
    plan: Plan,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
    animRenderer: AnimateRenderer,
    opts?: { trackedVehicleId?: number; onTrackTile?: (tileId: number) => void },
  ): Promise<number> {
    const vehicle = plan.vehicles[vehicleId]
    if (!vehicle || pathTileIds.length < 2) return 0

    const surfaceOffset = vehicle.vehicleType.offsetAlongNormal

    for (let i = 0; i < pathTileIds.length - 1; i++) {
      if (vehicleId === opts?.trackedVehicleId) {
        opts.onTrackTile?.(pathTileIds[i + 1])
      }
      const fromTile = tileApi.getTileById(pathTileIds[i])
      const toTile = tileApi.getTileById(pathTileIds[i + 1])
      if (!fromTile || !toTile) continue

      const fromPos = new THREE.Vector3(fromTile.x, fromTile.z, -fromTile.y)
      const toPos = new THREE.Vector3(toTile.x, toTile.z, -toTile.y)
      const fromNormal = fromPos.clone().sub(globeCenter).normalize()
      const toNormal = toPos.clone().sub(globeCenter).normalize()
      // Direction toward the destination tile — constant within this segment
      const segmentForward = toPos.clone().sub(fromPos)

      const startTime = this.accumulatedDelta
      const endTime = startTime + SECONDS_PER_TILE

      while (this.accumulatedDelta < endTime) {
        const t = Math.min(1, (this.accumulatedDelta - startTime) / SECONDS_PER_TILE)
        const interpPos = fromPos.clone().lerp(toPos, t)
        const interpNormal = fromNormal.clone().lerp(toNormal, t).normalize()
        animRenderer.placeVehicleWorld(vehicleId, interpPos, interpNormal, segmentForward, surfaceOffset)
        await this.waitSeconds(0)
      }

      // Snap to exact destination
      animRenderer.placeVehicleWorld(vehicleId, toPos, toNormal, segmentForward, surfaceOffset)
    }

    return pathTileIds.length - 1
  }

  private async animateCrateToWorldPos(
    crateId: number,
    toWorldPos: THREE.Vector3,
    animRenderer: AnimateRenderer,
  ): Promise<void> {
    const fromWorldPos = animRenderer.getCrateWorldPosition(crateId)
    if (!fromWorldPos) return
    const startTime = this.accumulatedDelta
    const endTime = startTime + CARGO_ANIM_SECONDS
    while (this.accumulatedDelta < endTime) {
      const t = Math.min(1, (this.accumulatedDelta - startTime) / CARGO_ANIM_SECONDS)
      const easedT = t * t * (3 - 2 * t)
      animRenderer.setCrateWorldPosition(crateId, fromWorldPos.clone().lerp(toWorldPos, easedT))
      await this.waitSeconds(0)
    }
    animRenderer.setCrateWorldPosition(crateId, toWorldPos)
  }

  async run(opts: PlanAnimatorRunOptions): Promise<LevelStats> {
    const { plan, derived, tileApi, globeCenter, animRenderer, onTrackTile, onEvent } = opts

    await animRenderer.setup(plan, derived.initialSnapshot, tileApi, globeCenter)

    const stats = emptyLevelStats()

    // Track per-vehicle cargo slot counts for attaching crates visually
    const vehicleSlots = new Map<number, number>()

    for (const step of derived.steps) {
      if (step.kind === 'JOURNEY') {
        const journeyStep = step as DerivedJourneyStep
        // Pick a vehicle moving this step and pan to it before animating
        const movingJourney = journeyStep.journeys.reduce<typeof journeyStep.journeys[0] | undefined>(
          (best, j) => j.pathTileIds.length >= 2 && (!best || j.pathTileIds.length > best.pathTileIds.length) ? j : best,
          undefined,
        )
        if (movingJourney && onTrackTile) {
          onTrackTile(movingJourney.pathTileIds[0])
          await this.waitSeconds(PRE_STEP_PAN_WAIT)
        }
        // Animate all journeys in this step in parallel
        const stepTrackedId = movingJourney?.vehicleId
        await Promise.all(
          journeyStep.journeys.map(async (j) => {
            if (j.pathTileIds.length < 2) return
            await this.animateVehicleAlongPath(
              j.vehicleId, j.pathTileIds, plan, tileApi, globeCenter, animRenderer,
              { trackedVehicleId: stepTrackedId, onTrackTile },
            )
            const lastTileId = j.pathTileIds[j.pathTileIds.length - 1]
            const countryName = tileApi.getTileById(lastTileId)?.country_name ?? 'unknown'
            onEvent?.({ kind: 'VEHICLE_ARRIVED', vehicleName: plan.vehicles[j.vehicleId]?.name ?? 'Vehicle', countryName })
          }),
        )
      } else {
        const cargoStep = step as DerivedCargoStep
        if (!cargoStep.action.valid) {
          // Skip invalid cargo steps
          continue
        }
        const { intent } = cargoStep.action

        switch (intent.kind) {
          case 'LOAD': {
            const slot = vehicleSlots.get(intent.vehicleId) ?? 0
            const targetWorldPos = animRenderer.getCargoSlotWorldPosition(intent.vehicleId, slot)
            if (targetWorldPos) {
              await this.animateCrateToWorldPos(intent.crateId, targetWorldPos, animRenderer)
            } else {
              await this.waitSeconds(CARGO_ANIM_SECONDS)
            }
            animRenderer.attachCrateToVehicle(intent.crateId, intent.vehicleId, slot)
            vehicleSlots.set(intent.vehicleId, slot + 1)
            break
          }
          case 'UNLOAD': {
            const slot = vehicleSlots.get(intent.vehicleId) ?? 1
            animRenderer.detachCrateFromVehicle(intent.crateId)
            const tile = tileApi.getTileById(intent.toTileId)
            if (tile) {
              const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
              const tileNormal = tilePos.clone().sub(globeCenter).normalize()
              await this.animateCrateToWorldPos(intent.crateId, tilePos, animRenderer)
              animRenderer.orientCrateToTile(intent.crateId, tileNormal)
            } else {
              await this.waitSeconds(CARGO_ANIM_SECONDS)
            }
            vehicleSlots.set(intent.vehicleId, Math.max(0, slot - 1))
            break
          }
          case 'DELIVER': {
            const slot = vehicleSlots.get(intent.vehicleId) ?? 1
            const crate = plan.crates[intent.crateId]
            animRenderer.detachCrateFromVehicle(intent.crateId)
            const tile = tileApi.getTileById(intent.toTileId)
            if (tile) {
              const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
              await this.animateCrateToWorldPos(intent.crateId, tilePos, animRenderer)
            } else {
              await this.waitSeconds(CARGO_ANIM_SECONDS)
            }
            if (crate) {
              stats.timecostEarned += crate.rewardTimecost
              stats.cratesDelivered++
              const countryName = tileApi.getTileById(intent.toTileId)?.country_name ?? 'unknown'
              onEvent?.({ kind: 'CRATE_DELIVERED', countryName, reward: crate.rewardTimecost })
            }
            animRenderer.destroyCrate(intent.crateId)
            vehicleSlots.set(intent.vehicleId, Math.max(0, slot - 1))
            break
          }
        }
      }
    }

    return stats
  }
}
