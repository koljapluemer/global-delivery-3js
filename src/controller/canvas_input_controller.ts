import * as THREE from 'three'
import { DragGesture } from '@use-gesture/vanilla'
import { ndcFromEvent } from '../view/utils/ndc'
import { snapshotBefore } from './plan_deriver'
import { inputStateValue } from './input_mode/input_mode_machine'
import type { Plan } from '../model/types/Plan'
import type { DerivedPlanState } from '../model/types/DerivedPlanState'
import type { TileCenter } from './layer_0/tile_centers_api'
import type { PlanIntentManager } from './plan_intent_manager'
import type { UndoRedoHistory } from './undo_redo'
import type { InspectorPanel } from '../view/ui/inspector_panel/inspector_panel'
import type { PinContextMenu } from '../view/ui/overlay/pin_context_menu'
import type { CrateLoadMenu } from '../view/ui/overlay/crate_load_menu'
import type { PinPlacementPreview } from '../view/game/pin_placement_preview'
import type { CrateDropPreview } from '../view/game/crate_drop_preview'
import type { CrateLoadPreview } from '../view/game/crate_load_preview'
import type { LabelRenderer } from '../view/game/label_renderer'
import type { GameItemRenderer } from '../view/game/game_item_renderer'
import type { TileCentersApi } from './layer_0/tile_centers_api'
import type { Actor } from 'xstate'

const DRAG_THRESHOLD_PX = 5

export interface CanvasInputControllerDeps {
  renderer: THREE.WebGLRenderer
  camera: THREE.Camera
  domElement: HTMLCanvasElement
  gameItemRenderer: GameItemRenderer
  inputModeActor: Actor<typeof import('./input_mode/input_mode_machine').inputModeMachine>
  intentManager: PlanIntentManager
  undoHistory: UndoRedoHistory
  getDerived: () => DerivedPlanState
  getPlan: () => Plan
  getLastHoveredTile: () => TileCenter | null
  getLabelRenderer: () => LabelRenderer | null
  tileCentersApi: TileCentersApi
  inspectorPanel: InspectorPanel
  pinContextMenu: PinContextMenu
  crateLoadMenu: CrateLoadMenu
  pinPlacementPreview: PinPlacementPreview | null
  crateDropPreview: CrateDropPreview | null
  crateLoadPreview: CrateLoadPreview | null
  rerender: () => Promise<void>
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
      undoHistory,
      getDerived,
      getPlan,
      getLastHoveredTile,
      getLabelRenderer,
      tileCentersApi,
      inspectorPanel,
      pinContextMenu,
      crateLoadMenu,
      pinPlacementPreview,
      crateDropPreview,
      crateLoadPreview,
      rerender,
    } = this.deps
    const snapshot = inputModeActor.getSnapshot()
    const ctx = snapshot.context
    const state = inputStateValue(snapshot)
    const derived = getDerived()
    const plan = getPlan()
    const lastHoveredTile = getLastHoveredTile()
    const labelRenderer = getLabelRenderer()

    if (state === 'pinDrag') {
      const vehicleId = ctx.vehicleId!
      const stepIndex = ctx.stepIndex!
      if (!isDrag) {
        pinPlacementPreview?.hide()
        inputModeActor.send({ type: 'POINTER_UP', isDrag: false })
        pinContextMenu.show(
          vehicleId,
          stepIndex,
          plan,
          derived,
          tileCentersApi,
          e.clientX,
          e.clientY,
          {
            onUnload: (crateId) => {
              labelRenderer?.setPinLabelOffset(vehicleId, stepIndex, 0)
              pinContextMenu.hide()
              inputModeActor.send({ type: 'ENTER_CRATE_DROP', vehicleId, stepIndex, crateId })
            },
            onRemoveUnload: async (cargoStepIndex) => {
              labelRenderer?.setPinLabelOffset(vehicleId, stepIndex, 0)
              undoHistory.snapshot(plan)
              intentManager.removeCargoIntent(cargoStepIndex)
              pinContextMenu.hide()
              await rerender()
              inspectorPanel.refresh(plan, derived, tileCentersApi)
            },
            onClose: () => labelRenderer?.setPinLabelOffset(vehicleId, stepIndex, 0),
          },
        )
        labelRenderer?.setPinLabelOffset(vehicleId, stepIndex, 80)
      } else {
        if (lastHoveredTile) {
          undoHistory.snapshot(plan)
          intentManager.updateJourneyTarget(stepIndex, vehicleId, lastHoveredTile.tile_id)
        }
        pinPlacementPreview?.hide()
        await rerender()
        inspectorPanel.show({ kind: 'VEHICLE', id: vehicleId }, plan, derived, tileCentersApi)
        inputModeActor.send({ type: 'CONFIRM_PIN_DRAG' })
      }
      this.pointerDownHit = null
      return
    }

    if (state === 'routeSplit') {
      const vehicleId = ctx.vehicleId!
      const insertAfterStepIndex = ctx.insertAfterStepIndex!
      if (isDrag && lastHoveredTile) {
        undoHistory.snapshot(plan)
        intentManager.insertJourneyStepAfter(insertAfterStepIndex, vehicleId, lastHoveredTile.tile_id)
      }
      pinPlacementPreview?.hide()
      await rerender()
      inspectorPanel.show({ kind: 'VEHICLE', id: vehicleId }, plan, derived, tileCentersApi)
      inputModeActor.send({ type: 'CONFIRM_ROUTE_SPLIT' })
      this.pointerDownHit = null
      return
    }

    if (state === 'crateDrop') {
      const unload = ctx.lastValidUnloadTarget
      if (unload) {
        const { toTileId, isDelivery, insertAfterStepIndex } = unload
        undoHistory.snapshot(plan)
        intentManager.insertCargoStepAfter(
          insertAfterStepIndex,
          isDelivery
            ? { kind: 'DELIVER', crateId: ctx.crateId!, vehicleId: ctx.vehicleId!, toTileId }
            : { kind: 'UNLOAD', crateId: ctx.crateId!, vehicleId: ctx.vehicleId!, toTileId },
        )
        crateDropPreview?.hide()
        await rerender()
        inspectorPanel.show({ kind: 'VEHICLE', id: ctx.vehicleId! }, plan, derived, tileCentersApi)
      }
      inputModeActor.send({ type: 'CONFIRM_CRATE_DROP' })
      this.pointerDownHit = null
      return
    }

    if (state === 'crateLoad') {
      if (!isDrag && ctx.lastValidLoadTarget) {
        const { vehicleId, insertAfterStepIndex } = ctx.lastValidLoadTarget
        undoHistory.snapshot(plan)
        intentManager.insertCargoStepAfter(insertAfterStepIndex, {
          kind: 'LOAD',
          crateId: ctx.crateId!,
          vehicleId,
        })
        crateLoadPreview?.hide()
        await rerender()
        inspectorPanel.show({ kind: 'VEHICLE', id: vehicleId }, plan, derived, tileCentersApi)
      }
      inputModeActor.send({ type: 'CONFIRM_CRATE_LOAD' })
      this.pointerDownHit = null
      return
    }

    if (state === 'pinPlacement') {
      if (lastHoveredTile) {
        undoHistory.snapshot(plan)
        intentManager.addPinAfterLastVehicleStep(ctx.vehicleId!, lastHoveredTile.tile_id)
        pinPlacementPreview?.hide()
        await rerender()
        inspectorPanel.show({ kind: 'VEHICLE', id: ctx.vehicleId! }, plan, derived, tileCentersApi)
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
        inspectorPanel.show({ kind: 'VEHICLE', id: meta.entityId! }, plan, derived, tileCentersApi)
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
        undoHistory.snapshot(plan)
        intentManager.removeCargoIntent(meta.stepIndex!)
        await rerender()
      } else {
        inspectorPanel.hide()
      }
      this.pointerDownHit = null
    } else if (state === 'normal') {
      inspectorPanel.hide()
      this.pointerDownHit = null
    }
  }
}
