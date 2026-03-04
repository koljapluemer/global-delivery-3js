import * as THREE from 'three'
import { GlobeScene } from '../view/game/globe_scene'
import { MainCamera } from '../view/camera/main_camera'
import { GlobePointer } from '../controller/globe_pointer'
import { derivePlanState } from '../controller/plan_deriver'
import { deriveRouteLegs } from '../controller/traveltime'
import { GameItemRenderer } from '../view/game/game_item_renderer'
import { LabelRenderer } from '../view/game/label_renderer'
import { PinPlacementPreview } from '../view/game/pin_placement_preview'
import { CrateDropPreview } from '../view/game/crate_drop_preview'
import { CrateLoadPreview } from '../view/game/crate_load_preview'
import { PlanPanel } from '../view/ui/plan_panel/plan_panel'
import { InspectorPanel } from '../view/ui/inspector_panel/inspector_panel'
import { HudPanel } from '../view/ui/hud_panel/hud_panel'
import { CancelButton } from '../view/ui/overlay/cancel_button'
import { PinContextMenu } from '../view/ui/overlay/pin_context_menu'
import { CrateLoadMenu } from '../view/ui/overlay/crate_load_menu'
import { SceneInteractionManager } from '../controller/scene_interaction_manager'
import { createTileHoverHandler } from '../controller/tile_hover_controller'
import { wirePanelCallbacks } from './panel_wiring'
import { subscribeInputModeUI } from '../controller/input_mode/input_mode_ui'
import { CanvasInputController } from '../controller/canvas_input_controller'
import type { PlanIntentManager } from '../controller/plan_intent_manager'
import type { UndoRedoHistory } from '../controller/undo_redo'
import type { NavApi } from '../controller/navigation'
import type { TileCentersApi } from '../controller/layer_0/tile_centers_api'
import type { DerivedPlanState } from '../model/types/DerivedPlanState'
import type { GameState } from '../model/types/GameState'
import type { TileCenter } from '../controller/layer_0/tile_centers_api'
import type { Actor } from 'xstate'

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
  inspectorPanel: InspectorPanel
  cancelButton: CancelButton
  pinContextMenu: PinContextMenu
  crateLoadMenu: CrateLoadMenu
  gameState: GameState
}

export class App {
  private readonly deps: AppDeps
  private derived: DerivedPlanState
  private globeCenter = new THREE.Vector3()
  private lastHoveredTile: TileCenter | null = null
  private labelRenderer: LabelRenderer | null = null
  private pinPlacementPreview: PinPlacementPreview | null = null
  private crateDropPreview: CrateDropPreview | null = null
  private crateLoadPreview: CrateLoadPreview | null = null
  private sceneInteractionManager: SceneInteractionManager | null = null
  private canvasInputController: CanvasInputController | null = null

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
    planPanel.update(intentManager.getPlan(), this.derived)
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
      inspectorPanel,
      cancelButton,
      pinContextMenu,
      crateLoadMenu,
      undoHistory,
      gameState,
    } = this.deps

    this.globeCenter.copy(boundingSphere.center)
    mainCamera.fitToGlobe(boundingSphere)

    this.pinPlacementPreview = new PinPlacementPreview(globeScene.scene, navApi)
    this.crateDropPreview = new CrateDropPreview(globeScene.scene)
    this.crateLoadPreview = new CrateLoadPreview(globeScene.scene)

    const pointer = new GlobePointer(
      renderer.domElement,
      mainCamera.camera,
      tileCentersApi,
      boundingSphere,
    )
    pointer.onHover = createTileHoverHandler({
      setLastHoveredTile: (tile) => {
        this.lastHoveredTile = tile
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
        this.labelRenderer.onEntityClick = (target) => {
          inspectorPanel.show(
            target,
            intentManager.getPlan(),
            this.derived,
            tileCentersApi,
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
        planPanel.update(plan, this.derived)

        wirePanelCallbacks({
          inspectorPanel,
          planPanel,
          hudPanel,
          intentManager,
          undoHistory,
          inputModeActor,
          tileCentersApi,
          rerender: () => this.rerender(),
          getDerived: () => this.derived,
          getPlan: () => intentManager.getPlan(),
        })

        subscribeInputModeUI({
          inputModeActor,
          cancelButton,
          domElement: renderer.domElement,
          pinPlacementPreview: this.pinPlacementPreview,
          crateDropPreview: this.crateDropPreview,
          crateLoadPreview: this.crateLoadPreview,
          pinContextMenu,
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
          tileCentersApi,
          inspectorPanel,
          pinContextMenu,
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
    this.sceneInteractionManager?.update()
    renderer.render(globeScene.scene, mainCamera.camera)
    this.labelRenderer?.update(deltaSeconds)
  }

  resize(): void {
    const { renderer, mainCamera } = this.deps
    mainCamera.setAspect(window.innerWidth / window.innerHeight)
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
}
