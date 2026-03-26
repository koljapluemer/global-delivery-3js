import * as THREE from 'three'
import { InteractionManager } from 'three.interactive'
import { findFirstValidLoadInsertionInDwellRange } from './plan_deriver'
import { inputStateValue } from './input_mode/input_mode_machine'
import type { DerivedPlanState } from '../model/types/DerivedPlanState'
import type { Plan } from '../model/types/Plan'
import type { GameItemRenderer } from '../view/game/game_item_renderer'
import type { CrateLoadPreview } from '../view/game/crate_load_preview'
import type { TileCentersApi } from './layer_0/tile_centers_api'
import type { Actor } from 'xstate'

export interface SceneInteractionManagerDeps {
  renderer: THREE.WebGLRenderer
  camera: THREE.Camera
  domElement: HTMLCanvasElement
  gameItemRenderer: GameItemRenderer
  inputModeActor: Actor<typeof import('./input_mode/input_mode_machine').inputModeMachine>
  getDerived: () => DerivedPlanState
  getPlan: () => Plan
  getGlobeCenter: () => THREE.Vector3
  tileCentersApi: TileCentersApi
  crateLoadPreview: CrateLoadPreview | null
}

export class SceneInteractionManager {
  private readonly deps: SceneInteractionManagerDeps
  private interactionManager: InteractionManager
  private addedPickables: THREE.Object3D[] = []

  constructor(deps: SceneInteractionManagerDeps) {
    this.deps = deps
    this.interactionManager = new InteractionManager(
      this.deps.renderer,
      this.deps.camera,
      this.deps.domElement,
    )
  }

  sync(): void {
    this.addedPickables.forEach((o) => this.interactionManager.remove(o))
    this.addedPickables = []
    const pickables = this.deps.gameItemRenderer.getPickableObjects()
    const {
      gameItemRenderer,
      inputModeActor,
      getDerived,
      getPlan,
      getGlobeCenter,
      tileCentersApi,
      crateLoadPreview,
    } = this.deps
    pickables.forEach((obj) => {
      this.interactionManager.add(obj)
      this.addedPickables.push(obj)
      const onHover = (isOver: boolean) => {
        gameItemRenderer.setHovered(isOver ? obj : null)
        const snapshot = inputModeActor.getSnapshot()
        if (inputStateValue(snapshot) !== 'crateLoad' || !isOver) return
        const ctx = snapshot.context
        const meta = obj.userData as { entityType?: string; entityId?: number; vehicleId?: number; stepIndex?: number }
        let vehicleId: number | undefined
        let insertAfter = -1
        if (meta.entityType === 'VEHICLE' && meta.entityId !== undefined) {
          vehicleId = meta.entityId
        } else if (meta.entityType === 'PIN' && meta.vehicleId !== undefined) {
          vehicleId = meta.vehicleId
          insertAfter = meta.stepIndex!
        }
        const derived = getDerived()
        if (vehicleId !== undefined && ctx.crateId !== undefined) {
          const intent = { kind: 'LOAD' as const, crateId: ctx.crateId, vehicleId }
          const resolvedInsertAfter = findFirstValidLoadInsertionInDwellRange(intent, insertAfter, vehicleId, getPlan(), derived)
          if (resolvedInsertAfter !== null) {
            inputModeActor.send({
              type: 'UPDATE_LOAD_TARGET',
              payload: { vehicleId, insertAfterStepIndex: resolvedInsertAfter },
            })
            const snap = resolvedInsertAfter < 0 ? derived.initialSnapshot : derived.stepSnapshots[resolvedInsertAfter]
            const crateTileAtLoad = snap.crateOnGround.get(ctx.crateId)
            const vehicleTileAtLoad = snap.vehiclePositions.get(vehicleId)
            if (crateLoadPreview && crateTileAtLoad !== undefined && vehicleTileAtLoad !== undefined) {
              const hue = getPlan().vehicles[vehicleId]?.hue ?? 0
              crateLoadPreview.update(
                crateTileAtLoad,
                vehicleTileAtLoad,
                hue,
                getGlobeCenter(),
                tileCentersApi,
              )
            } else crateLoadPreview?.hide()
          } else {
            inputModeActor.send({ type: 'UPDATE_LOAD_TARGET', payload: null })
            crateLoadPreview?.hide()
          }
        } else {
          inputModeActor.send({ type: 'UPDATE_LOAD_TARGET', payload: null })
          crateLoadPreview?.hide()
        }
      }
      const objWithEvents = obj as THREE.Object3D & {
        addEventListener: (name: string, fn: () => void) => void
      }
      objWithEvents.addEventListener('mouseover', () => onHover(true))
      objWithEvents.addEventListener('mouseout', () => {
        gameItemRenderer.setHovered(null)
        if (inputStateValue(inputModeActor.getSnapshot()) === 'crateLoad') {
          inputModeActor.send({ type: 'UPDATE_LOAD_TARGET', payload: null })
          crateLoadPreview?.hide()
        }
      })
    })
  }

  update(): void {
    this.interactionManager.update()
  }
}
