import * as THREE from 'three'
import { GlobeScene } from './view/game/globe_scene'
import { MainCamera } from './view/camera/main_camera'
import { TileCentersApi } from './controller/layer_0/tile_centers_api'
import { NavApi } from './controller/navigation'
import { PlanIntentManager } from './controller/plan_intent_manager'
import { createActor } from 'xstate'
import { inputModeMachine } from './controller/input_mode/input_mode_machine'
import { GameItemRenderer } from './view/game/game_item_renderer'
import { PlanPanel } from './view/ui/plan_panel/plan_panel'
import { CancelButton } from './view/ui/overlay/cancel_button'
import { CrateLoadMenu } from './view/ui/overlay/crate_load_menu'
import { VehicleSetupPopup } from './view/ui/overlay/vehicle_setup_popup'
import { App } from './app/App'
import { MainMenuScreen } from './view/ui/screens/main_menu_screen'
import { GameOverScreen } from './view/ui/screens/game_over_screen'
import { CardPickScreen } from './view/ui/screens/card_pick_screen'
import { GameFlowController } from './controller/game_flow/game_flow_controller'
import { EventQueue } from './controller/event_queue'
import { ToastView } from './view/ui/toast/toast_view'
import type { GameEvent } from './model/types/GameEvent'
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

const intentManager = new PlanIntentManager({
  vehicles: {},
  crates: {},
  initialState: { vehiclePositions: {}, cratePositions: {}, vehicleCargo: {} },
  steps: [],
})
const inputModeActor = createActor(inputModeMachine).start()
const gameItemRenderer = new GameItemRenderer(globeScene.scene, navApi, renderer)

const planPanel = new PlanPanel()
planPanel.mount(document.body, tileCentersApi)
const cancelButton = new CancelButton()
cancelButton.mount(document.body, () => inputModeActor.send({ type: 'CANCEL' }))
const crateLoadMenu = new CrateLoadMenu()
crateLoadMenu.mount(document.body)

const mainMenuScreen = new MainMenuScreen()
mainMenuScreen.mount(document.body)
const gameOverScreen = new GameOverScreen()
gameOverScreen.mount(document.body)
const cardPickScreen = new CardPickScreen()
cardPickScreen.mount(document.body)
const vehicleSetupPopup = new VehicleSetupPopup()
vehicleSetupPopup.mount(document.body)

const eventQueue = new EventQueue<GameEvent>()
const toastView = new ToastView()
toastView.mount(document.body)
eventQueue.subscribe((event) => toastView.push(event))

const gameState: GameState = {
  timecostBudget: 1000,
  turnNumber: 0,
  cratesDelivered: 0,
}

const app = new App({
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
  vehicleSetupPopup,
  onEvent: (e) => eventQueue.push(e),
})

const flowController = new GameFlowController({
  app,
  gameState,
  mainMenuScreen,
  gameOverScreen,
  cardPickScreen,
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
