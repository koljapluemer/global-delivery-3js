import * as THREE from 'three'
import { GlobeScene } from './view/game/globe_scene'
import { MainCamera } from './view/camera/main_camera'
import { TileCentersApi } from './controller/layer_0/tile_centers_api'
import { NavApi } from './controller/navigation'
import { generateWorld } from './model/world_generator'
import { PlanIntentManager } from './controller/plan_intent_manager'
import { UndoRedoHistory } from './controller/undo_redo'
import { createActor } from 'xstate'
import { inputModeMachine } from './controller/input_mode/input_mode_machine'
import { GameItemRenderer } from './view/game/game_item_renderer'
import { HudPanel } from './view/ui/hud_panel/hud_panel'
import { PlanPanel } from './view/ui/plan_panel/plan_panel'
import { CancelButton } from './view/ui/overlay/cancel_button'
import { PinContextMenu } from './view/ui/overlay/pin_context_menu'
import { CrateLoadMenu } from './view/ui/overlay/crate_load_menu'
import { App } from './app/App'
import { CountryHoverBar } from './view/ui/country_hover_bar'
import { MainMenuScreen } from './view/ui/screens/main_menu_screen'
import { GameOverScreen } from './view/ui/screens/game_over_screen'
import { GameFlowController } from './controller/game_flow/game_flow_controller'
import { INITIAL_LIVES, STAMPS_GOAL_PER_TURN } from './controller/game_flow/game_flow_machine'
import type { GameState } from './model/types/GameState'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const globeScene = new GlobeScene()
const mainCamera = new MainCamera(renderer.domElement)
const tileCentersApi = new TileCentersApi()
const navApi = new NavApi()
tileCentersApi.load()
navApi.load()

const intentManager = new PlanIntentManager(generateWorld(tileCentersApi, navApi))
const undoHistory = new UndoRedoHistory()
const inputModeActor = createActor(inputModeMachine).start()
const gameItemRenderer = new GameItemRenderer(globeScene.scene, navApi, renderer)

const hudPanel = new HudPanel()
hudPanel.mount(document.body)
const planPanel = new PlanPanel()
planPanel.mount(document.body, tileCentersApi)
const cancelButton = new CancelButton()
cancelButton.mount(document.body, () => inputModeActor.send({ type: 'CANCEL' }))
const pinContextMenu = new PinContextMenu()
pinContextMenu.mount(document.body)
const crateLoadMenu = new CrateLoadMenu()
crateLoadMenu.mount(document.body)
const countryHoverBar = new CountryHoverBar()
countryHoverBar.mount(document.body)

const mainMenuScreen = new MainMenuScreen()
mainMenuScreen.mount(document.body)
const gameOverScreen = new GameOverScreen()
gameOverScreen.mount(document.body)

const gameState: GameState = {
  money: 0,
  stamps: 0,
  lives: INITIAL_LIVES,
  stampsGoal: STAMPS_GOAL_PER_TURN,
  traveltimeBudget: 1000,
}

const app = new App({
  renderer,
  globeScene,
  mainCamera,
  tileCentersApi,
  navApi,
  intentManager,
  undoHistory,
  inputModeActor,
  gameItemRenderer,
  hudPanel,
  planPanel,
  cancelButton,
  pinContextMenu,
  crateLoadMenu,
  gameState,
  countryHoverBar,
})

const flowController = new GameFlowController({
  app,
  hudPanel,
  gameState,
  mainMenuScreen,
  gameOverScreen,
  intentManager,
  tileCentersApi,
  navApi,
})

globeScene.load().then(({ boundingSphere }) => {
  app.start(boundingSphere)
  flowController.start()
})

let lastTime = performance.now()
function animate(now: number): void {
  const delta = (now - lastTime) / 1000
  lastTime = now
  app.animate(delta)
  requestAnimationFrame(animate)
}
requestAnimationFrame(animate)

window.addEventListener('resize', () => app.resize())
