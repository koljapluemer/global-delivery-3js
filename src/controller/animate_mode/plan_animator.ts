import * as THREE from 'three'
import type { Plan } from '../../model/types/Plan'
import type { DerivedPlanState, DerivedJourneyStep, DerivedCargoStep } from '../../model/types/DerivedPlanState'
import type { TileCentersApi } from '../layer_0/tile_centers_api'
import type { GameState } from '../../model/types/GameState'
import type { LevelStats } from '../../model/types/LevelStats'
import type { AnimateRenderer } from '../../view/game/animate_renderer'
import { emptyLevelStats } from '../../model/types/LevelStats'

/** Duration for animating a single tile step in seconds. */
const SECONDS_PER_TILE = 0.12
/** Duration for cargo load/unload/deliver animation in seconds. */
const CARGO_ANIM_SECONDS = 0.3

export interface PlanAnimatorRunOptions {
  plan: Plan
  derived: DerivedPlanState
  tileApi: TileCentersApi
  globeCenter: THREE.Vector3
  animRenderer: AnimateRenderer
  gameState: GameState
  onHudUpdate: () => void
}

/**
 * Sequences through a derived plan step-by-step, animating vehicle and crate movements.
 * Driven by tick() calls from the render loop.
 */
export class PlanAnimator {
  private tickResolve: (() => void) | null = null
  private accumulatedDelta = 0

  /** Called each frame by the render loop with the delta time in seconds. */
  tick(delta: number): void {
    this.accumulatedDelta += delta
    this.tickResolve?.()
  }

  /** Awaits until at least `seconds` of real time have elapsed (via tick calls). */
  private waitSeconds(seconds: number): Promise<void> {
    const target = this.accumulatedDelta + seconds
    return new Promise((resolve) => {
      const check = () => {
        if (this.accumulatedDelta >= target) {
          this.tickResolve = null
          resolve()
        } else {
          this.tickResolve = check
        }
      }
      this.tickResolve = check
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
  ): Promise<number> {
    const vehicle = plan.vehicles[vehicleId]
    if (!vehicle || pathTileIds.length < 2) return 0

    const surfaceOffset = vehicle.vehicleType.offsetAlongNormal

    for (let i = 0; i < pathTileIds.length - 1; i++) {
      const fromTile = tileApi.getTileById(pathTileIds[i])
      const toTile = tileApi.getTileById(pathTileIds[i + 1])
      if (!fromTile || !toTile) continue

      const fromPos = new THREE.Vector3(fromTile.x, fromTile.z, -fromTile.y)
      const toPos = new THREE.Vector3(toTile.x, toTile.z, -toTile.y)
      const fromNormal = fromPos.clone().sub(globeCenter).normalize()
      const toNormal = toPos.clone().sub(globeCenter).normalize()

      const startTime = this.accumulatedDelta
      const endTime = startTime + SECONDS_PER_TILE

      while (this.accumulatedDelta < endTime) {
        const t = Math.min(1, (this.accumulatedDelta - startTime) / SECONDS_PER_TILE)
        const interpPos = fromPos.clone().lerp(toPos, t)
        const interpNormal = fromNormal.clone().lerp(toNormal, t).normalize()
        animRenderer.placeVehicleWorld(vehicleId, interpPos, interpNormal, surfaceOffset)
        await this.waitSeconds(0)
      }

      // Snap to exact destination
      animRenderer.placeVehicleWorld(vehicleId, toPos, toNormal, surfaceOffset)
    }

    return pathTileIds.length - 1
  }

  async run(opts: PlanAnimatorRunOptions): Promise<LevelStats> {
    const { plan, derived, tileApi, globeCenter, animRenderer, gameState, onHudUpdate } = opts

    await animRenderer.setup(plan, derived.initialSnapshot, tileApi, globeCenter)

    const stats = emptyLevelStats()

    // Track per-vehicle cargo slot counts for attaching crates visually
    const vehicleSlots = new Map<number, number>()

    for (const step of derived.steps) {
      if (step.kind === 'JOURNEY') {
        const journeyStep = step as DerivedJourneyStep
        // Animate all journeys in this step in parallel
        await Promise.all(
          journeyStep.journeys.map(async (j) => {
            if (j.pathTileIds.length < 2) return
            const tilesTraversed = await this.animateVehicleAlongPath(
              j.vehicleId, j.pathTileIds, plan, tileApi, globeCenter, animRenderer,
            )
            stats.pathTilesTraversed += tilesTraversed
          }),
        )
      } else {
        const cargoStep = step as DerivedCargoStep
        if (!cargoStep.action.valid) {
          // Skip invalid cargo steps
          continue
        }
        const { intent } = cargoStep.action

        await this.waitSeconds(CARGO_ANIM_SECONDS)

        switch (intent.kind) {
          case 'LOAD': {
            const slot = vehicleSlots.get(intent.vehicleId) ?? 0
            animRenderer.attachCrateToVehicle(intent.crateId, intent.vehicleId, slot)
            vehicleSlots.set(intent.vehicleId, slot + 1)
            break
          }
          case 'UNLOAD': {
            animRenderer.placeCrate(intent.crateId, intent.toTileId, tileApi, globeCenter)
            const slot = vehicleSlots.get(intent.vehicleId) ?? 1
            vehicleSlots.set(intent.vehicleId, Math.max(0, slot - 1))
            break
          }
          case 'DELIVER': {
            const crate = plan.crates[intent.crateId]
            if (crate) {
              gameState.money += crate.rewardMoney
              gameState.stamps += crate.rewardStamps
              stats.moneyEarned += crate.rewardMoney
              stats.stampsEarned += crate.rewardStamps
              stats.cratesDelivered++
              onHudUpdate()
            }
            animRenderer.destroyCrate(intent.crateId)
            const slot = vehicleSlots.get(intent.vehicleId) ?? 1
            vehicleSlots.set(intent.vehicleId, Math.max(0, slot - 1))
            break
          }
        }
      }
    }

    return stats
  }
}
