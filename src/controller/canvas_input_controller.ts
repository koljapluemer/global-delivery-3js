import * as THREE from 'three'
import { DragGesture } from '@use-gesture/vanilla'
import { ndcFromEvent } from '../view/utils/ndc'
import { snapshotBefore } from './plan_deriver'
import { inputStateValue } from './input_mode/input_mode_machine'
import type { Plan } from '../model/types/Plan'
import type { DerivedPlanState } from '../model/types/DerivedPlanState'
import type { TileCenter } from './layer_0/tile_centers_api'
import type { PlanIntentManager } from './plan_intent_manager'
import type { CrateLoadMenu } from '../view/ui/overlay/crate_load_menu'
import type { PinPlacementPreview } from '../view/game/pin_placement_preview'
import type { CrateDropPreview } from '../view/game/crate_drop_preview'
import type { CrateLoadPreview } from '../view/game/crate_load_preview'
import type { VehiclePlacementPreview } from '../view/game/vehicle_placement_preview'
import type { LabelRenderer } from '../view/game/label_renderer'
import type { GameItemRenderer } from '../view/game/game_item_renderer'
import type { NavApi } from './navigation'
import type { Actor } from 'xstate'
import { AvailableVehicleTypes } from '../model/db/vehicles'
import { isVehicleTileValid } from './tile_hover_controller'

const DRAG_THRESHOLD_PX = 5

export interface CanvasInputControllerDeps {
  renderer: THREE.WebGLRenderer
  camera: THREE.Camera
  domElement: HTMLCanvasElement
  gameItemRenderer: GameItemRenderer
  inputModeActor: Actor<typeof import('./input_mode/input_mode_machine').inputModeMachine>
  intentManager: PlanIntentManager
  getDerived: () => DerivedPlanState
  getPlan: () => Plan
  getLastHoveredTile: () => TileCenter | null
  getLabelRenderer: () => LabelRenderer | null
  crateLoadMenu: CrateLoadMenu
  pinPlacementPreview: PinPlacementPreview | null
  crateDropPreview: CrateDropPreview | null
  crateLoadPreview: CrateLoadPreview | null
  vehiclePlacementPreview: VehiclePlacementPreview | null
  getOnVehicleTilePlaced: () => ((tileId: number) => void) | null
  navApi: NavApi
  rerender: () => Promise<void>
  onInvalidAction?: (message: string) => void
}

export class CanvasInputController {
  private readonly deps: CanvasInputControllerDeps
  private pointerDownHit: { meta: Record<string, unknown>; object: THREE.Object3D } | null = null
  private lastPointerUp = { clientX: 0, clientY: 0 }

  constructor(deps: CanvasInputControllerDeps) {
    this.deps = deps
  }

  setup(): void {
    const { domElement, camera, gameItemRenderer, inputModeActor, getPlan } = this.deps

    domElement.addEventListener(
      'pointerup',
      (e: PointerEvent) => {
        this.lastPointerUp = { clientX: e.clientX, clientY: e.clientY }
      },
    )

    domElement.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        if (e.button !== 0) return
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(ndcFromEvent(e as unknown as MouseEvent, domElement), camera)
        const hits = raycaster.intersectObjects([...gameItemRenderer.getPickableObjects()], true)
        this.pointerDownHit = hits.length
          ? { meta: hits[0].object.userData as Record<string, unknown>, object: hits[0].object }
          : null

        const snapshot = inputModeActor.getSnapshot()
        if (inputStateValue(snapshot) !== 'normal') return
        if (!hits.length) return
        const meta = hits[0].object.userData as Record<string, unknown>
        const derived = this.deps.getDerived()

        if (meta.entityType === 'PIN') {
          const plan = getPlan()
          const stepIndex = meta.stepIndex as number
          const prevSnapshot = snapshotBefore(derived, stepIndex)
          const prevTileId = prevSnapshot.vehiclePositions.get(meta.vehicleId as number)
          if (prevTileId === undefined) return
          let nextTileId: number | undefined
          for (let i = stepIndex + 1; i < plan.steps.length; i++) {
            const s = plan.steps[i]
            if (s.kind !== 'JOURNEY') continue
            const jj = s.journeys.find((j) => j.vehicleId === meta.vehicleId)
            if (jj) {
              nextTileId = jj.toTileId
              break
            }
          }
          inputModeActor.send({
            type: 'POINTER_DOWN_PIN',
            vehicleId: meta.vehicleId as number,
            stepIndex,
            prevTileId,
            nextTileId,
          })
        } else if (meta.entityType === 'ROUTE_LINE') {
          inputModeActor.send({
            type: 'POINTER_DOWN_ROUTE_LINE',
            vehicleId: meta.vehicleId as number,
            insertAfterStepIndex: meta.insertAfterStepIndex as number,
            fromTileId: meta.fromTileId as number,
            toTileId: meta.toTileId as number,
          })
        }
      },
      true,
    )

    new DragGesture(domElement, ({ last, movement }) => {
      if (!last) return
      const isDrag =
        Math.abs(movement[0]) > DRAG_THRESHOLD_PX || Math.abs(movement[1]) > DRAG_THRESHOLD_PX
      this.handlePointerUp(this.lastPointerUp, isDrag)
    })
  }

  private async handlePointerUp(
    e: { clientX: number; clientY: number },
    isDrag: boolean,
  ): Promise<void> {
    const {
      inputModeActor,
      intentManager,
      getPlan,
      getLastHoveredTile,
      getLabelRenderer,
      crateLoadMenu,
      pinPlacementPreview,
      crateDropPreview,
      crateLoadPreview,
      vehiclePlacementPreview,
      rerender,
    } = this.deps
    const snapshot = inputModeActor.getSnapshot()
    const ctx = snapshot.context
    const state = inputStateValue(snapshot)
    const plan = getPlan()
    const lastHoveredTile = getLastHoveredTile()

    if (state === 'pinDrag') {
      const vehicleId = ctx.vehicleId!
      const stepIndex = ctx.stepIndex!
      if (!isDrag) {
        pinPlacementPreview?.hide()
        inputModeActor.send({ type: 'POINTER_UP', isDrag: false })
        getLabelRenderer()?.openPinMenu(vehicleId, stepIndex)
      } else {
        const navMesh = getPlan().vehicles[vehicleId]?.vehicleType.navMesh
        if (lastHoveredTile && navMesh && this.deps.navApi.isTileOnNavMesh(lastHoveredTile.tile_id, navMesh)) {
          intentManager.updateJourneyTarget(stepIndex, vehicleId, lastHoveredTile.tile_id)
        }
        pinPlacementPreview?.hide()
        await rerender()
        inputModeActor.send({ type: 'CONFIRM_PIN_DRAG' })
      }
      this.pointerDownHit = null
      return
    }

    if (state === 'routeSplit') {
      const vehicleId = ctx.vehicleId!
      const insertAfterStepIndex = ctx.insertAfterStepIndex!
      const navMesh = getPlan().vehicles[vehicleId]?.vehicleType.navMesh
      if (isDrag && lastHoveredTile && navMesh && this.deps.navApi.isTileOnNavMesh(lastHoveredTile.tile_id, navMesh)) {
        intentManager.insertJourneyStepAfter(insertAfterStepIndex, vehicleId, lastHoveredTile.tile_id)
      }
      pinPlacementPreview?.hide()
      await rerender()
      inputModeActor.send({ type: 'CONFIRM_ROUTE_SPLIT' })
      this.pointerDownHit = null
      return
    }

    if (state === 'crateDrop') {
      const unload = ctx.lastValidUnloadTarget
      if (unload) {
        const { toTileId, isDelivery, insertAfterStepIndex } = unload
        intentManager.insertCargoStepAfter(
          insertAfterStepIndex,
          isDelivery
            ? { kind: 'DELIVER', crateId: ctx.crateId!, vehicleId: ctx.vehicleId!, toTileId }
            : { kind: 'UNLOAD', crateId: ctx.crateId!, vehicleId: ctx.vehicleId!, toTileId },
        )
        crateDropPreview?.hide()
        await rerender()
      } else {
        const tile = lastHoveredTile
        const message = tile && !tile.is_land ? 'Crate must be dropped on land' : 'No valid drop location'
        this.deps.onInvalidAction?.(message)
      }
      inputModeActor.send({ type: 'CONFIRM_CRATE_DROP' })
      this.pointerDownHit = null
      return
    }

    if (state === 'crateLoad') {
      if (!isDrag && ctx.lastValidLoadTarget) {
        const { vehicleId, insertAfterStepIndex } = ctx.lastValidLoadTarget
        intentManager.insertCargoStepAfter(insertAfterStepIndex, {
          kind: 'LOAD',
          crateId: ctx.crateId!,
          vehicleId,
        })
        crateLoadPreview?.hide()
        await rerender()
      } else if (!isDrag) {
        this.deps.onInvalidAction?.('No vehicle can load this crate here')
      }
      inputModeActor.send({ type: 'CONFIRM_CRATE_LOAD' })
      this.pointerDownHit = null
      return
    }

    if (state === 'vehiclePlacement') {
      if (lastHoveredTile) {
        const vehicleType = AvailableVehicleTypes[ctx.vehicleTypeId ?? '']
        const legal = vehicleType !== undefined
          && isVehicleTileValid(lastHoveredTile.tile_id, vehicleType.navMesh, this.deps.navApi, this.deps.getDerived().occupiedTiles)
        if (legal) {
          vehiclePlacementPreview?.hide()
          this.deps.getOnVehicleTilePlaced()?.(lastHoveredTile.tile_id)
          inputModeActor.send({ type: 'CONFIRM_VEHICLE_PLACEMENT', tileId: lastHoveredTile.tile_id })
        }
      }
      this.pointerDownHit = null
      return
    }

    if (state === 'pinPlacement') {
      const navMesh = getPlan().vehicles[ctx.vehicleId!]?.vehicleType.navMesh
      if (lastHoveredTile && navMesh && this.deps.navApi.isTileOnNavMesh(lastHoveredTile.tile_id, navMesh)) {
        if (ctx.insertAfterStepIndex !== undefined) {
          intentManager.addOrMergeJourneyAfter(ctx.insertAfterStepIndex, ctx.vehicleId!, lastHoveredTile.tile_id)
        } else {
          intentManager.addPinAfterLastVehicleStep(ctx.vehicleId!, lastHoveredTile.tile_id)
        }
        pinPlacementPreview?.hide()
        await rerender()
      }
      inputModeActor.send({
        type: 'CONFIRM_PIN_PLACEMENT',
        vehicleId: ctx.vehicleId!,
        fromTileId: ctx.fromTileId!,
      })
      this.pointerDownHit = null
      return
    }

    if (state === 'normal' && !isDrag && this.pointerDownHit) {
      const meta = this.pointerDownHit.meta as {
        entityType?: string
        entityId?: number
        crateId?: number
        stepIndex?: number
        tileId?: number
      }
      if (meta.entityType === 'VEHICLE') {
        getLabelRenderer()?.openVehicleMenu(meta.entityId as number)
      } else if (meta.entityType === 'CRATE' || meta.entityType === 'GHOST_CRATE') {
        const crateId = meta.entityType === 'CRATE' ? meta.entityId! : meta.crateId!
        const stepIndex = meta.stepIndex ?? 0
        const crateTileId = meta.tileId ?? 0
        crateLoadMenu.show(crateId, plan, e.clientX, e.clientY, {
          onLoad: () => {
            crateLoadMenu.hide()
            inputModeActor.send({ type: 'ENTER_CRATE_LOAD', crateId, stepIndex, crateTileId })
          },
          onClose: () => {},
        })
      } else if (meta.entityType === 'INVALID_INTENT') {
        intentManager.removeCargoIntent(meta.stepIndex!)
        await rerender()
      }
      this.pointerDownHit = null
    } else if (state === 'normal') {
      this.pointerDownHit = null
    }
  }
}
