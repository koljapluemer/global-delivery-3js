import * as THREE from 'three'
import { buildPinMenu } from '../view/ui/overlay/pin_label_menu'
import { buildVehicleMenu } from '../view/ui/overlay/vehicle_label_menu'
import { GlobeScene } from '../view/game/globe_scene'
import { MainCamera } from '../view/camera/main_camera'
import { GlobePointer } from '../controller/globe_pointer'
import { derivePlanState, getVehicleLastTileId } from '../controller/plan_deriver'
import { deriveRouteLegs } from '../controller/traveltime'
import { deriveTurnEconomy } from '../controller/turn_economy'
import { GameItemRenderer } from '../view/game/game_item_renderer'
import { LabelRenderer } from '../view/game/label_renderer'
import { PinPlacementPreview } from '../view/game/pin_placement_preview'
import { CrateDropPreview } from '../view/game/crate_drop_preview'
import { CrateLoadPreview } from '../view/game/crate_load_preview'
import { PlanPanel } from '../view/ui/plan_panel/plan_panel'
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
import type { NavApi } from '../controller/navigation'
import type { TileCentersApi } from '../controller/layer_0/tile_centers_api'
import type { TileCenter } from '../controller/layer_0/tile_centers_api'
import type { GameState } from '../model/types/GameState'
import type { LevelStats } from '../model/types/LevelStats'
import type { Actor } from 'xstate'
import { AnimateRenderer } from '../view/game/animate_renderer'
import { PlanAnimator } from '../controller/animate_mode/plan_animator'
import { CrateArrivalAnimator } from '../controller/animate_mode/crate_arrival_animator'
import { CountryHighlightRenderer } from '../view/game/country_highlight_renderer'
import { FairTileHighlightRenderer } from '../view/game/fair_tile_highlight_renderer'

export interface AppDeps {
  renderer: THREE.WebGLRenderer
  globeScene: GlobeScene
  mainCamera: MainCamera
  tileCentersApi: TileCentersApi
  navApi: NavApi
  intentManager: PlanIntentManager
  inputModeActor: Actor<typeof import('../controller/input_mode/input_mode_machine').inputModeMachine>
  gameItemRenderer: GameItemRenderer
  planPanel: PlanPanel
  cancelButton: CancelButton
  crateLoadMenu: CrateLoadMenu
  gameState: GameState
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

  async rerender(): Promise<void> {
    const {
      intentManager,
      navApi,
      tileCentersApi,
      gameItemRenderer,
      planPanel,
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
    const hasInvalidIntents = this.derived.steps.some(
      (s) => s.kind === 'CARGO' && !(s as DerivedCargoStep).action.valid,
    )
    const canConfirm = !hasInvalidIntents
    const economy = deriveTurnEconomy(gameState, intentManager.getPlan(), this.derived)
    planPanel.update(intentManager.getPlan(), this.derived, economy, { turnNumber: gameState.turnNumber, cratesDelivered: gameState.cratesDelivered }, canConfirm)
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
      planPanel,
      cancelButton,
      crateLoadMenu,
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

    const pointer = new GlobePointer(
      renderer.domElement,
      mainCamera.camera,
      tileCentersApi,
      boundingSphere,
    )
    pointer.onHover = createTileHoverHandler({
      setLastHoveredTile: (tile) => {
        this.lastHoveredTile = tile
        this.deps.planPanel.updateHoveredCountry(tile?.country_name ?? null)
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
                intentManager.removeJourneyIntent(stepIndex, vehicleId)
                close(); await this.rerender()
              },
              onUnload: (crateId) => {
                close()
                inputModeActor.send({ type: 'ENTER_CRATE_DROP', vehicleId, stepIndex, crateId })
              },
              onRemoveUnload: async (cargoStepIndex) => {
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
        const economy = deriveTurnEconomy(gameState, plan, this.derived)
        planPanel.update(plan, this.derived, economy, { turnNumber: gameState.turnNumber, cratesDelivered: gameState.cratesDelivered }, false)

        planPanel.onFocusTile = (tileId) => {
          const t = tileCentersApi.getTileById(tileId)
          if (t) mainCamera.panTo(new THREE.Vector3(t.x, t.z, -t.y))
        }
        wirePanelCallbacks({
          planPanel,
          intentManager,
          rerender: () => this.rerender(),
          getDerived: () => this.derived,
          getPlan: () => intentManager.getPlan(),
          onConfirmPlan: () => this.onConfirmPlan?.(),
        })

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
    this.deps.planPanel.hide()
  }

  showPlanUI(): void {
    this.deps.planPanel.show()
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

    this.labelRenderer?.syncCrateLabels(intentManager.getPlan(), tileCentersApi, new Set([crateId]))
  }

  async enterAnimateMode(
    onComplete: (stats: LevelStats) => void | Promise<void>,
  ): Promise<void> {
    const { globeScene, planPanel, tileCentersApi } = this.deps

    planPanel.hide()

    this.deps.gameItemRenderer.dispose()
    this.labelRenderer?.dispose()
    this.labelRenderer = null

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
      onTrackTile: (tileId) => {
        const t = tileCentersApi.getTileById(tileId)
        if (t) this.deps.mainCamera.panTo(new THREE.Vector3(t.x, t.z, -t.y))
      },
    })

    this.frameCallback = null
    animRenderer.dispose()

    document.body.removeChild(overlay)

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
              this.deps.intentManager.removeJourneyIntent(stepIndex, vehicleId)
              close(); await this.rerender()
            },
            onUnload: (crateId) => {
              close()
              this.deps.inputModeActor.send({ type: 'ENTER_CRATE_DROP', vehicleId, stepIndex, crateId })
            },
            onRemoveUnload: async (cargoStepIndex) => {
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
    const { intentManager } = this.deps
    const snaps = this.derived.stepSnapshots
    const lastSnap = snaps.length > 0 ? snaps[snaps.length - 1] : this.derived.initialSnapshot

    const vehiclePositions: Record<number, number> = Object.fromEntries(lastSnap.vehiclePositions)

    const cratePositions: Record<number, number> = Object.fromEntries(lastSnap.crateOnGround)
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

    this.fairTileHighlightRenderer?.hide()
  }

  resize(): void {
    const { renderer, mainCamera } = this.deps
    mainCamera.setAspect(window.innerWidth / window.innerHeight)
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
}
