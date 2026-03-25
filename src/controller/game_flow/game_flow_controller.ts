import { createActor } from 'xstate'
import { gameFlowMachine } from './game_flow_machine'
import { CARD_DEFINITIONS, STARTING_CARD_KINDS } from '../../model/db/cards'
import type { CardKind } from '../../model/types/Card'
import type { GameState } from '../../model/types/GameState'
import type { App } from '../../app/App'
import type { MainMenuScreen } from '../../view/ui/screens/main_menu_screen'
import type { GameOverScreen } from '../../view/ui/screens/game_over_screen'
import type { CardPickScreen } from '../../view/ui/screens/card_pick_screen'
import type { PlanIntentManager } from '../plan_intent_manager'
import type { TileCentersApi } from '../layer_0/tile_centers_api'
import type { NavApi } from '../navigation'
import { emptyPlan, addInitialCrates, createRandomCrate } from '../../model/world_generator'

export interface GameFlowControllerDeps {
  app: App
  gameState: GameState
  mainMenuScreen: MainMenuScreen
  gameOverScreen: GameOverScreen
  cardPickScreen: CardPickScreen
  intentManager: PlanIntentManager
  tileCentersApi: TileCentersApi
  navApi: NavApi
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
  const shuffled = [...landNodeIds].sort(() => Math.random() - 0.5)
  for (const id of shuffled) {
    if (!occupied.has(id)) return id
  }
  return shuffled[0]
}

function resetGameState(gameState: GameState): void {
  gameState.timecostBudget = 1000
  gameState.turnNumber = 0
  gameState.cratesDelivered = 0
}

export class GameFlowController {
  private readonly deps: GameFlowControllerDeps
  private readonly actor = createActor(gameFlowMachine)
  private isNewGame = false

  constructor(deps: GameFlowControllerDeps) {
    this.deps = deps
  }

  start(): void {
    const { app, gameState } = this.deps

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

        case 'CARD_PICK': {
          if (this.isNewGame) {
            this.isNewGame = false
            this.deps.intentManager.resetPlan(emptyPlan())
            resetGameState(gameState)
          }
          app.hidePlanUI()
          void this.runCardPickSequence(STARTING_CARD_KINDS).then(() => {
            // Vehicles are now placed — generate fair crates based on their positions
            addInitialCrates(
              this.deps.intentManager.getPlan(),
              this.deps.navApi,
              this.deps.tileCentersApi,
            )
            this.actor.send({ type: 'CARD_PICK_DONE' })
          })
          break
        }

        case 'PLAN': {
          app.showPlanUI()
          void app.rerender()
          break
        }

        case 'ANIMATE': {
          const travelCost = app.getDerived().totalTraveltime
          void app.enterAnimateMode(async (stats) => {
            app.advancePlanToNextTurn()

            const turnFee = 100 + 25 * gameState.turnNumber
            gameState.timecostBudget += stats.timecostEarned - travelCost - turnFee
            gameState.cratesDelivered += stats.cratesDelivered
            gameState.turnNumber++

            if (gameState.timecostBudget <= 0) {
              this.actor.send({ type: 'ANIMATION_DONE', outcome: 'GAME_OVER' })
              return
            }

            const countryNames = uniqueCountryNames(this.deps.tileCentersApi)
            const newCrate = createRandomCrate(countryNames)
            const tileId = pickUnoccupiedLandTile(this.deps.navApi, this.deps.intentManager)
            const crateId = this.deps.intentManager.addGroundCrate(tileId, newCrate)

            await app.runCrateArrivalAnimation(crateId, tileId)

            this.actor.send({ type: 'ANIMATION_DONE', outcome: 'CONTINUE' })
          })
          break
        }

        case 'GAME_OVER':
          app.hidePlanUI()
          this.deps.gameOverScreen.show({
            cratesDelivered: gameState.cratesDelivered,
            turnNumber: gameState.turnNumber,
            finalBudget: gameState.timecostBudget,
          })
          break
      }
    })

    this.deps.mainMenuScreen.onStartGame = () => {
      this.isNewGame = true
      this.actor.send({ type: 'START_GAME' })
    }

    this.deps.gameOverScreen.onRestart = () => {
      this.isNewGame = true
      this.actor.send({ type: 'RESTART' })
    }

    this.actor.start()
  }

  private hideAllScreens(): void {
    this.deps.mainMenuScreen.hide()
    this.deps.gameOverScreen.hide()
    this.deps.cardPickScreen.hide()
  }

  private async runCardPickSequence(kinds: CardKind[]): Promise<void> {
    const remaining = [...kinds]
    while (remaining.length > 0) {
      const picked = await new Promise<CardKind>((resolve) => {
        this.deps.cardPickScreen.onCardPicked = resolve
        this.deps.cardPickScreen.show({
          cards: remaining.map((k) => CARD_DEFINITIONS[k]),
          prompt: `Pick a card (${remaining.length} remaining)`,
        })
      })
      this.deps.cardPickScreen.hide()
      remaining.splice(remaining.indexOf(picked), 1)
      await this.executeCard(picked)
    }
  }

  private async executeCard(kind: CardKind): Promise<void> {
    switch (kind) {
      case 'GET_CAR':
        await this.deps.app.enterVehiclePlacementMode('basic_car')
        break
      case 'GET_BOAT':
        await this.deps.app.enterVehiclePlacementMode('small_boat')
        break
      default:
        break
    }
  }
}
