import { createActor } from 'xstate'
import { gameFlowMachine, INITIAL_LIVES, STAMPS_GOAL_PER_TURN } from './game_flow_machine'
import type { GameState } from '../../model/types/GameState'
import type { App } from '../../app/App'
import type { HudPanel } from '../../view/ui/hud_panel/hud_panel'
import type { MainMenuScreen } from '../../view/ui/screens/main_menu_screen'
import type { GameOverScreen } from '../../view/ui/screens/game_over_screen'
import type { PlanIntentManager } from '../plan_intent_manager'
import type { TileCentersApi } from '../layer_0/tile_centers_api'
import type { NavApi } from '../navigation'
import { generateWorld, createRandomCrate } from '../../model/world_generator'

export interface GameFlowControllerDeps {
  app: App
  hudPanel: HudPanel
  gameState: GameState
  mainMenuScreen: MainMenuScreen
  gameOverScreen: GameOverScreen
  intentManager: PlanIntentManager
  tileCentersApi: TileCentersApi
  navApi: NavApi
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function uniqueCountryNames(tileApi: TileCentersApi): string[] {
  const seen = new Set<string>()
  for (const tile of tileApi.getAll()) {
    if (tile.country_name) seen.add(tile.country_name)
  }
  return Array.from(seen)
}

function pickUnoccupiedLandTile(navApi: NavApi, intentManager: PlanIntentManager): number {
  const landNodeIds = navApi.getLargestComponentNodeIds('LAND')
  const plan = intentManager.getPlan()
  const occupied = new Set<number>([
    ...Object.values(plan.initialState.vehiclePositions),
    ...Object.values(plan.initialState.cratePositions),
  ])
  // Shuffle-pick until we find an unoccupied tile
  const shuffled = [...landNodeIds].sort(() => Math.random() - 0.5)
  for (const id of shuffled) {
    if (!occupied.has(id)) return id
  }
  // Fallback: pick any land tile (shouldn't happen with 40k tiles)
  return shuffled[0]
}

function resetGameState(gameState: GameState): void {
  gameState.money = 0
  gameState.stamps = 0
  gameState.lives = INITIAL_LIVES
  gameState.stampsGoal = STAMPS_GOAL_PER_TURN
  gameState.traveltimeBudget = 1000
}

export class GameFlowController {
  private readonly deps: GameFlowControllerDeps
  private readonly actor = createActor(gameFlowMachine)
  private isNewGame = false

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

        case 'PLAN': {
          gameState.stamps = 0
          if (this.isNewGame) {
            this.isNewGame = false
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
          const onComplete = async () => {
            app.advancePlanToNextTurn()

            // Judge this turn: did the player hit the stamp goal?
            if (gameState.stamps < STAMPS_GOAL_PER_TURN) {
              gameState.lives--
              hudPanel.update(gameState, 0, false, false)
              // Brief pause so the player sees the life lost
              await sleep(900)
            }

            if (gameState.lives <= 0) {
              this.actor.send({ type: 'ANIMATION_DONE', outcome: 'GAME_OVER' })
              return
            }

            // Drop a new crate onto the globe
            const countryNames = uniqueCountryNames(this.deps.tileCentersApi)
            const newCrate = createRandomCrate(countryNames)
            const tileId = pickUnoccupiedLandTile(this.deps.navApi, this.deps.intentManager)
            const crateId = this.deps.intentManager.addGroundCrate(tileId, newCrate)

            await app.runCrateArrivalAnimation(crateId, tileId)

            this.actor.send({ type: 'ANIMATION_DONE', outcome: 'CONTINUE' })
          }
          void app.enterAnimateMode(onHudUpdate, onComplete)
          break
        }

        case 'GAME_OVER':
          app.hidePlanUI()
          this.deps.gameOverScreen.show()
          break
      }
    })

    // Wire screen button callbacks
    this.deps.mainMenuScreen.onStartGame = () => {
      resetGameState(gameState)
      this.isNewGame = true
      this.actor.send({ type: 'START_GAME' })
    }

    this.deps.gameOverScreen.onRestart = () => {
      resetGameState(gameState)
      this.isNewGame = true
      this.actor.send({ type: 'RESTART' })
    }

    this.actor.start()
  }

  private hideAllScreens(): void {
    this.deps.mainMenuScreen.hide()
    this.deps.gameOverScreen.hide()
  }
}
