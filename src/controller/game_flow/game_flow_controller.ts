import { createActor } from 'xstate'
import { gameFlowMachine, STAMPS_GOAL } from './game_flow_machine'
import type { LevelStats } from '../../model/types/LevelStats'
import type { GameState } from '../../model/types/GameState'
import type { App } from '../../app/App'
import type { HudPanel } from '../../view/ui/hud_panel/hud_panel'
import type { MainMenuScreen } from '../../view/ui/screens/main_menu_screen'
import type { ShopScreen } from '../../view/ui/screens/shop_screen'
import type { StartLevelScreen } from '../../view/ui/screens/start_level_screen'
import type { LevelEvaluationScreen } from '../../view/ui/screens/level_evaluation_screen'
import type { PlanIntentManager } from '../plan_intent_manager'
import type { TileCentersApi } from '../layer_0/tile_centers_api'
import type { NavApi } from '../navigation'
import { generateWorld } from '../../model/world_generator'

export interface GameFlowControllerDeps {
  app: App
  hudPanel: HudPanel
  gameState: GameState
  mainMenuScreen: MainMenuScreen
  shopScreen: ShopScreen
  startLevelScreen: StartLevelScreen
  levelEvalScreen: LevelEvaluationScreen
  intentManager: PlanIntentManager
  tileCentersApi: TileCentersApi
  navApi: NavApi
}

export class GameFlowController {
  private readonly deps: GameFlowControllerDeps
  private readonly actor = createActor(gameFlowMachine)
  private isFirstPlanTurn = false

  constructor(deps: GameFlowControllerDeps) {
    this.deps = deps
  }

  start(): void {
    const { app, gameState, hudPanel } = this.deps

    // Wire confirm plan from App to game flow machine
    app.onConfirmPlan = () => {
      this.actor.send({ type: 'CONFIRM_PLAN' })
    }

    this.actor.subscribe((snapshot) => {
      const state = snapshot.value as string

      this.hideAllScreens()

      switch (state) {
        case 'MAIN_MENU':
          app.hidePlanUI()
          this.deps.mainMenuScreen.show()
          break

        case 'SHOP':
          app.hidePlanUI()
          this.deps.shopScreen.show()
          break

        case 'START_LEVEL':
          app.hidePlanUI()
          this.deps.startLevelScreen.show()
          break

        case 'PLAN': {
          if (this.isFirstPlanTurn) {
            this.isFirstPlanTurn = false
            // Generate a fresh world for this level
            const newPlan = generateWorld(this.deps.tileCentersApi, this.deps.navApi)
            this.deps.intentManager.resetPlan(newPlan)
          }
          app.showPlanUI()
          void app.rerender()
          break
        }

        case 'ANIMATE': {
          const onHudUpdate = () => {
            hudPanel.update(gameState, 0, false, false)
          }
          const onComplete = (stats: LevelStats) => {
            app.advancePlanToNextTurn()
            this.actor.send({ type: 'ANIMATION_DONE', stats })
          }
          void app.enterAnimateMode(onHudUpdate, onComplete)
          break
        }

        case 'LEVEL_EVALUATION': {
          app.hidePlanUI()
          const { levelStats } = snapshot.context
          const finalStats: LevelStats = {
            ...levelStats,
            stampsEarned: gameState.stamps,
          }
          const success = gameState.stamps >= STAMPS_GOAL
          this.deps.levelEvalScreen.update(finalStats)
          this.deps.levelEvalScreen.show()
          if (success) {
            this.deps.levelEvalScreen.onNext = () => this.actor.send({ type: 'NEXT' })
          } else {
            this.deps.levelEvalScreen.onBackToMenu = () => this.actor.send({ type: 'BACK_TO_MENU' })
          }
          break
        }
      }
    })

    // Wire screen button callbacks
    this.deps.mainMenuScreen.onStartGame = () => this.actor.send({ type: 'START_GAME' })
    this.deps.shopScreen.onToLevel = () => this.actor.send({ type: 'TO_LEVEL' })
    this.deps.startLevelScreen.onStartLevel = () => {
      gameState.stamps = 0
      this.isFirstPlanTurn = true
      this.actor.send({ type: 'START_LEVEL_ACTION' })
    }

    this.actor.start()
  }

  private hideAllScreens(): void {
    this.deps.mainMenuScreen.hide()
    this.deps.shopScreen.hide()
    this.deps.startLevelScreen.hide()
    this.deps.levelEvalScreen.hide()
  }
}
