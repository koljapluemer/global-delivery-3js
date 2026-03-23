import * as THREE from 'three'
import { buildPinMenu } from '../view/ui/overlay/pin_label_menu'
import { buildVehicleMenu } from '../view/ui/overlay/vehicle_label_menu'
import { GlobeScene } from '../view/game/globe_scene'
import { MainCamera } from '../view/camera/main_camera'
import { GlobePointer } from '../controller/globe_pointer'
import { derivePlanState, getVehicleLastTileId } from '../controller/plan_deriver'
import { deriveRouteLegs } from '../controller/traveltime'
import { GameItemRenderer } from '../view/game/game_item_renderer'
import { LabelRenderer } from '../view/game/label_renderer'
import { PinPlacementPreview } from '../view/game/pin_placement_preview'
import { CrateDropPreview } from '../view/game/crate_drop_preview'
import { CrateLoadPreview } from '../view/game/crate_load_preview'
import { PlanPanel } from '../view/ui/plan_panel/plan_panel'
import { HudPanel } from '../view/ui/hud_panel/hud_panel'
import { CancelButton } from '../view/ui/overlay/cancel_button'
import { CrateLoadMenu } from '../view/ui/overlay/crate_load_menu'
import { SceneInteractionManager } from '../controller/scene_interaction_manager'
import { createTileHoverHandler } from '../controller/tile_hover_controller'
import { wirePanelCallbacks } from './panel_wiring'
import { subscribeInputModeUI } from '../controller/input_mode/input_mode_ui'
import { CanvasInputController } from '../controller/canvas_input_controller'
import type { DerivedPlanState } from '../model/types/DerivedPlanState'
import type { DerivedCargoStep } from '../model/types/DerivedPlanState'
import type { PlanIntentManager } from '../controller/plan_intent_manager'
import type { UndoRedoHistory } from '../controller/undo_redo'
import type { NavApi } from '../controller/navigation'
import type { TileCentersApi } from '../controller/layer_0/tile_centers_api'
import type { CountryHoverBar } from '../view/ui/country_hover_bar'
import type { GameState } from '../model/types/GameState'
import type { TileCenter } from '../controller/layer_0/tile_centers_api'
import type { Actor } from 'xstate'
import type { LevelStats } from '../model/types/LevelStats'
import { AnimateRenderer } from '../view/game/animate_renderer'
import { PlanAnimator } from '../controller/animate_mode/plan_animator'
import { CrateArrivalAnimator } from '../controller/animate_mode/crate_arrival_animator'
import { CountryHighlightRenderer } from '../view/game/country_highlight_renderer'
import { FairTileHighlightRenderer } from '../view/game/fair_tile_highlight_renderer'
import { computeFairTileSet, type FairTileSet } from '../controller/fair_tiles'

export interface AppDeps {
  renderer: THREE.WebGLRenderer
  globeScene: GlobeScene
  mainCamera: MainCamera
  tileCentersApi: TileCentersApi
  navApi: NavApi
  intentManager: PlanIntentManager
  undoHistory: UndoRedoHistory
  inputModeActor: Actor<typeof import('../controller/input_mode/input_mode_machine').inputModeMachine>
  gameItemRenderer: GameItemRenderer
  hudPanel: HudPanel
  planPanel: PlanPanel
  cancelButton: CancelButton
  crateLoadMenu: CrateLoadMenu
  gameState: GameState
  countryHoverBar: CountryHoverBar
}

export class App {
  private readonly deps: AppDeps
  private derived: DerivedPlanState
  private globeCenter = new THREE.Vector3()
  private boundingSphere: THREE.Sphere | null = null
  private lastHoveredTile: TileCenter | null = null
  private labelRenderer: LabelRenderer | null = null
  private pinPlacementPreview: PinPlacementPreview | null = null
  private crateDropPreview: CrateDropPreview | null = null
  private crateLoadPreview: CrateLoadPreview | null = null
  private sceneInteractionManager: SceneInteractionManager | null = null
  private canvasInputController: CanvasInputController | null = null
  private frameCallback: ((delta: number) => void) | null = null
  private countryHighlightRenderer: CountryHighlightRenderer | null = null
  private fairTileHighlightRenderer: FairTileHighlightRenderer | null = null
  private fairTileSet: FairTileSet | null = null
  onConfirmPlan: (() => void) | null = null

  constructor(deps: AppDeps) {
    this.deps = deps
    this.derived = derivePlanState(
      deps.intentManager.getPlan(),
      deps.navApi,
      deps.tileCentersApi,
    )
  }

  getDerived(): DerivedPlanState {
    return this.derived
  }

  getGlobeCenter(): THREE.Vector3 {
    return this.globeCenter
  }

  getLastHoveredTile(): TileCenter | null {
    return this.lastHoveredTile
  }

  async rerender(): Promise<void> {
    const {
      intentManager,
      navApi,
      tileCentersApi,
      gameItemRenderer,
      hudPanel,
      planPanel,
      undoHistory,
      gameState,
    } = this.deps
    this.derived = derivePlanState(intentManager.getPlan(), navApi, tileCentersApi)
    const legs = deriveRouteLegs(this.derived)
    gameItemRenderer.dispose()
    await gameItemRenderer.render(
      intentManager.getPlan(),
      this.derived,
      tileCentersApi,
      this.globeCenter,
    )
    this.sceneInteractionManager?.sync()
    this.labelRenderer?.syncCrateLabels(intentManager.getPlan(), tileCentersApi)
    this.labelRenderer?.syncVehicleLabels(intentManager.getPlan(), tileCentersApi)
    this.labelRenderer?.syncPinsFromPlan(intentManager.getPlan(), tileCentersApi)
    this.labelRenderer?.syncRouteLegLabels(legs, tileCentersApi)
    hudPanel.update(
      gameState,
      this.derived.totalTraveltime,
      undoHistory.canUndo(),
      undoHistory.canRedo(),
    )
    const hasInvalidIntents = this.derived.steps.some(
      (s) => s.kind === 'CARGO' && !(s as DerivedCargoStep).action.valid,
    )
    const canConfirm = !hasInvalidIntents && this.derived.totalTraveltime <= gameState.traveltimeBudget
    planPanel.update(intentManager.getPlan(), this.derived, canConfirm)
  }

  start(boundingSphere: THREE.Sphere): void {
    const {
      renderer,
      globeScene,
      mainCamera,
      tileCentersApi,
      navApi,
      intentManager,
      inputModeActor,
      gameItemRenderer,
      hudPanel,
      planPanel,
      cancelButton,
      crateLoadMenu,
      undoHistory,
      gameState,
    } = this.deps

    this.boundingSphere = boundingSphere
    this.globeCenter.copy(boundingSphere.center)
    mainCamera.fitToGlobe(boundingSphere)

    this.pinPlacementPreview = new PinPlacementPreview(globeScene.scene, navApi)
    this.crateDropPreview = new CrateDropPreview(globeScene.scene)
    this.crateLoadPreview = new CrateLoadPreview(globeScene.scene)
    this.countryHighlightRenderer = new CountryHighlightRenderer(globeScene.scene, boundingSphere.center)
    this.fairTileHighlightRenderer = new FairTileHighlightRenderer(globeScene.scene, boundingSphere.center)
    this.fairTileSet = computeFairTileSet(intentManager.getPlan(), navApi, tileCentersApi)

    const pointer = new GlobePointer(
      renderer.domElement,
      mainCamera.camera,
      tileCentersApi,
      boundingSphere,
    )
    pointer.onHover = createTileHoverHandler({
      setLastHoveredTile: (tile) => {
        this.lastHoveredTile = tile
        this.deps.countryHoverBar.update(tile)
      },
      inputModeActor,
      getDerived: () => this.derived,
      getPlan: () => intentManager.getPlan(),
      getGlobeCenter: () => this.globeCenter,
      tileCentersApi,
      pinPlacementPreview: this.pinPlacementPreview,
      crateDropPreview: this.crateDropPreview,
      crateLoadPreview: this.crateLoadPreview,
    })

    gameItemRenderer
      .render(intentManager.getPlan(), this.derived, tileCentersApi, this.globeCenter)
      .then(() => {
        this.sceneInteractionManager = new SceneInteractionManager({
          renderer,
          camera: mainCamera.camera,
          domElement: renderer.domElement,
          gameItemRenderer,
          inputModeActor,
          getDerived: () => this.derived,
          getPlan: () => intentManager.getPlan(),
          getGlobeCenter: () => this.globeCenter,
          tileCentersApi,
          crateLoadPreview: this.crateLoadPreview,
        })
        this.sceneInteractionManager.sync()

        this.labelRenderer = new LabelRenderer(
          mainCamera.camera,
          boundingSphere.center,
          boundingSphere.radius,
        )
        this.labelRenderer.onEntityClick = (_, worldPosition) => {
          this.countryHighlightRenderer?.hide()
          mainCamera.panTo(worldPosition)
        }
        this.labelRenderer.onLocateCountry = (countryName, nearHint) => {
          this.countryHighlightRenderer?.hide()
          const nearestTile = this.countryHighlightRenderer?.show(countryName, tileCentersApi, mainCamera.camera.position) ?? nearHint
          mainCamera.panTo(nearestTile)
        }
        this.labelRenderer.onPinMenuOpen = (vehicleId, stepIndex, panel, close) => {
          buildPinMenu(panel,
            { vehicleId, stepIndex, plan: intentManager.getPlan(), derived: this.derived },
            {
              onAddPinAfter: () => {
                const fromTileId = this.derived.stepSnapshots[stepIndex]?.vehiclePositions.get(vehicleId)
                if (fromTileId === undefined) return
                close()
                inputModeActor.send({ type: 'ENTER_PIN_PLACEMENT', vehicleId, fromTileId, insertAfterStepIndex: stepIndex })
              },
              onRemovePin: async () => {
                undoHistory.snapshot(intentManager.getPlan())
                intentManager.removeJourneyIntent(stepIndex, vehicleId)
                close(); await this.rerender()
              },
              onUnload: (crateId) => {
                close()
                inputModeActor.send({ type: 'ENTER_CRATE_DROP', vehicleId, stepIndex, crateId })
              },
              onRemoveUnload: async (cargoStepIndex) => {
                undoHistory.snapshot(intentManager.getPlan())
                intentManager.removeCargoIntent(cargoStepIndex)
                close(); await this.rerender()
              },
            },
          )
        }
        this.labelRenderer.onVehicleMenuOpen = (vehicleId, panel, close) => {
          buildVehicleMenu(panel,
            { vehicleId, plan: intentManager.getPlan() },
            {
              onAddPin: () => {
                const fromTileId = getVehicleLastTileId(intentManager.getPlan(), vehicleId)
                if (fromTileId === null) return
                close()
                inputModeActor.send({ type: 'ENTER_PIN_PLACEMENT', vehicleId, fromTileId })
              },
            },
          )
        }
        const plan = intentManager.getPlan()
        const legs = deriveRouteLegs(this.derived)
        this.labelRenderer.syncCrateLabels(plan, tileCentersApi)
        this.labelRenderer.syncVehicleLabels(plan, tileCentersApi)
        this.labelRenderer.syncPinsFromPlan(plan, tileCentersApi)
        this.labelRenderer.syncRouteLegLabels(legs, tileCentersApi)
        hudPanel.update(
          gameState,
          this.derived.totalTraveltime,
          undoHistory.canUndo(),
          undoHistory.canRedo(),
        )
        planPanel.update(plan, this.derived, false)

        planPanel.onFocusTile = (tileId) => {
          const t = tileCentersApi.getTileById(tileId)
          if (t) mainCamera.panTo(new THREE.Vector3(t.x, t.z, -t.y))
        }
        wirePanelCallbacks({
          planPanel,
          hudPanel,
          intentManager,
          undoHistory,
          rerender: () => this.rerender(),
          getDerived: () => this.derived,
          getPlan: () => intentManager.getPlan(),
          onConfirmPlan: () => this.onConfirmPlan?.(),
        })

        hudPanel.onToggleFairTiles = () => {
          if (hudPanel.showFairTiles && this.fairTileSet) {
            this.fairTileHighlightRenderer?.show(this.fairTileSet.tileIds, tileCentersApi)
          } else {
            this.fairTileHighlightRenderer?.hide()
          }
          hudPanel.update(gameState, this.derived.totalTraveltime, undoHistory.canUndo(), undoHistory.canRedo())
        }

        subscribeInputModeUI({
          inputModeActor,
          cancelButton,
          domElement: renderer.domElement,
          pinPlacementPreview: this.pinPlacementPreview,
          crateDropPreview: this.crateDropPreview,
          crateLoadPreview: this.crateLoadPreview,
          closeActiveMenu: () => this.labelRenderer?.closeActiveMenu(),
          crateLoadMenu,
          gameItemRenderer,
        })

        this.canvasInputController = new CanvasInputController({
          renderer,
          camera: mainCamera.camera,
          domElement: renderer.domElement,
          gameItemRenderer,
          inputModeActor,
          intentManager,
          undoHistory,
          getDerived: () => this.derived,
          getPlan: () => intentManager.getPlan(),
          getLastHoveredTile: () => this.lastHoveredTile,
          getLabelRenderer: () => this.labelRenderer,
          crateLoadMenu,
          pinPlacementPreview: this.pinPlacementPreview,
          crateDropPreview: this.crateDropPreview,
          crateLoadPreview: this.crateLoadPreview,
          rerender: () => this.rerender(),
        })
        this.canvasInputController.setup()
      })
  }

  animate(deltaSeconds: number): void {
    const { renderer, globeScene, mainCamera } = this.deps
    this.frameCallback?.(deltaSeconds)
    mainCamera.update(deltaSeconds)
    this.sceneInteractionManager?.update()
    renderer.render(globeScene.scene, mainCamera.camera)
    this.labelRenderer?.update(deltaSeconds)
  }

  hidePlanUI(): void {
    const { hudPanel, planPanel } = this.deps
    hudPanel.hide()
    planPanel.hide()
  }

  showPlanUI(): void {
    const { hudPanel, planPanel } = this.deps
    hudPanel.show()
    planPanel.show()
  }

  async runCrateArrivalAnimation(crateId: number, tileId: number): Promise<void> {
    const { globeScene, mainCamera, tileCentersApi, intentManager } = this.deps

    const tile = tileCentersApi.getTileById(tileId)
    if (tile) {
      const worldPos = new THREE.Vector3(tile.x, tile.z, -tile.y)
      mainCamera.panTo(worldPos)
    }

    const animator = new CrateArrivalAnimator()
    this.frameCallback = (delta) => animator.tick(delta)
    await animator.run(tileId, this.globeCenter, tileCentersApi, globeScene.scene)
    this.frameCallback = null
    animator.dispose()

    // Sync the new crate label with a pop-in animation
    this.labelRenderer?.syncCrateLabels(intentManager.getPlan(), tileCentersApi, new Set([crateId]))
  }

  async enterAnimateMode(
    onHudUpdate: () => void,
    onComplete: (stats: LevelStats) => void | Promise<void>,
  ): Promise<void> {
    const { globeScene, planPanel, tileCentersApi, gameState } = this.deps

    // Hide interactive panels, keep HUD
    planPanel.hide()

    // Remove PLAN-mode 3D objects so they don't sit under the animated meshes
    this.deps.gameItemRenderer.dispose()
    this.labelRenderer?.dispose()
    this.labelRenderer = null

    // Block all pointer interaction with an overlay
    const overlay = document.createElement('div')
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '50',
      cursor: 'wait',
    })
    document.body.appendChild(overlay)
    const animRenderer = new AnimateRenderer(globeScene.scene)
    const animator = new PlanAnimator()

    this.frameCallback = (delta) => animator.tick(delta)

    const stats = await animator.run({
      plan: this.deps.intentManager.getPlan(),
      derived: this.derived,
      tileApi: tileCentersApi,
      globeCenter: this.globeCenter,
      animRenderer,
      gameState,
      onHudUpdate,
      onTrackTile: (tileId) => {
        const t = tileCentersApi.getTileById(tileId)
        if (t) this.deps.mainCamera.panTo(new THREE.Vector3(t.x, t.z, -t.y))
      },
    })

    this.frameCallback = null
    animRenderer.dispose()

    document.body.removeChild(overlay)

    // Re-create label renderer so rerender() works normally in the next PLAN turn
    if (this.boundingSphere) {
      const { mainCamera } = this.deps
      this.labelRenderer = new LabelRenderer(
        mainCamera.camera,
        this.boundingSphere.center,
        this.boundingSphere.radius,
      )
      this.labelRenderer.onEntityClick = (_, worldPosition) => {
        this.countryHighlightRenderer?.hide()
        this.deps.mainCamera.panTo(worldPosition)
      }
      this.labelRenderer.onLocateCountry = (countryName, nearHint) => {
        this.countryHighlightRenderer?.hide()
        const nearestTile = this.countryHighlightRenderer?.show(countryName, this.deps.tileCentersApi, this.deps.mainCamera.camera.position) ?? nearHint
        this.deps.mainCamera.panTo(nearestTile)
      }
      this.labelRenderer.onPinMenuOpen = (vehicleId, stepIndex, panel, close) => {
        buildPinMenu(panel,
          { vehicleId, stepIndex, plan: this.deps.intentManager.getPlan(), derived: this.derived },
          {
            onAddPinAfter: () => {
              const fromTileId = this.derived.stepSnapshots[stepIndex]?.vehiclePositions.get(vehicleId)
              if (fromTileId === undefined) return
              close()
              this.deps.inputModeActor.send({ type: 'ENTER_PIN_PLACEMENT', vehicleId, fromTileId, insertAfterStepIndex: stepIndex })
            },
            onRemovePin: async () => {
              this.deps.undoHistory.snapshot(this.deps.intentManager.getPlan())
              this.deps.intentManager.removeJourneyIntent(stepIndex, vehicleId)
              close(); await this.rerender()
            },
            onUnload: (crateId) => {
              close()
              this.deps.inputModeActor.send({ type: 'ENTER_CRATE_DROP', vehicleId, stepIndex, crateId })
            },
            onRemoveUnload: async (cargoStepIndex) => {
              this.deps.undoHistory.snapshot(this.deps.intentManager.getPlan())
              this.deps.intentManager.removeCargoIntent(cargoStepIndex)
              close(); await this.rerender()
            },
          },
        )
      }
      this.labelRenderer.onVehicleMenuOpen = (vehicleId, panel, close) => {
        buildVehicleMenu(panel,
          { vehicleId, plan: this.deps.intentManager.getPlan() },
          {
            onAddPin: () => {
              const fromTileId = getVehicleLastTileId(this.deps.intentManager.getPlan(), vehicleId)
              if (fromTileId === null) return
              close()
              this.deps.inputModeActor.send({ type: 'ENTER_PIN_PLACEMENT', vehicleId, fromTileId })
            },
          },
        )
      }
    }

    await Promise.resolve(onComplete(stats))
  }

  advancePlanToNextTurn(): void {
    const { intentManager, undoHistory } = this.deps
    const snaps = this.derived.stepSnapshots
    const lastSnap = snaps.length > 0 ? snaps[snaps.length - 1] : this.derived.initialSnapshot

    const vehiclePositions: Record<number, number> = Object.fromEntries(lastSnap.vehiclePositions)

    // Ground crates keep their tile
    const cratePositions: Record<number, number> = Object.fromEntries(lastSnap.crateOnGround)
    // Crates on vehicles are placed at the vehicle's current tile
    for (const [vehicleId, crateIds] of lastSnap.vehicleCargo) {
      const vTile = lastSnap.vehiclePositions.get(vehicleId)
      if (vTile === undefined) continue
      for (const crateId of crateIds) {
        cratePositions[crateId] = vTile
      }
    }

    const plan = intentManager.getPlan()
    intentManager.resetPlan({
      ...plan,
      initialState: { vehiclePositions, cratePositions },
      steps: [],
    })
    undoHistory.clear()

    const { navApi, tileCentersApi, hudPanel } = this.deps
    this.fairTileSet = computeFairTileSet(intentManager.getPlan(), navApi, tileCentersApi)
    this.fairTileHighlightRenderer?.hide()
    hudPanel.showFairTiles = false
  }

  resize(): void {
    const { renderer, mainCamera } = this.deps
    mainCamera.setAspect(window.innerWidth / window.innerHeight)
    renderer.setSize(window.innerWidth, window.innerHeight)
  }

}
