import { createActor } from 'xstate'
import { gameFlowMachine } from './game_flow_machine'
import { CARD_DEFINITIONS, STARTING_CARD_KINDS } from '../../model/db/cards'
import type { CardKind } from '../../model/types/Card'
import type { GameState } from '../../model/types/GameState'
import type { GameSeed } from '../../model/types/GameSeed'
import type { App } from '../../app/App'
import type { MainMenuScreen } from '../../view/ui/screens/main_menu_screen'
import type { GameOverScreen } from '../../view/ui/screens/game_over_screen'
import type { CardPickScreen } from '../../view/ui/screens/card_pick_screen'
import type { PlanIntentManager } from '../plan_intent_manager'
import type { TileCentersApi } from '../layer_0/tile_centers_api'
import type { NavApi } from '../navigation'
import type { PlannedCrate } from '../crate_spawner'
import type { TutorialInstructionBox } from '../../view/ui/tutorial/tutorial_instruction_box'
import { emptyPlan } from '../../model/world_generator'
import { SeededRng } from '../../util/seeded_rng'
import { CrateSpawner } from '../crate_spawner'
import { AvailableVehicleTypes } from '../../model/db/vehicles'
import { TutorialController } from '../tutorial/tutorial_controller'
import { dailySeed } from '../../util/daily_seed'

export interface GameFlowControllerDeps {
  app: App
  gameState: GameState
  mainMenuScreen: MainMenuScreen
  gameOverScreen: GameOverScreen
  cardPickScreen: CardPickScreen
  intentManager: PlanIntentManager
  tileCentersApi: TileCentersApi
  navApi: NavApi
  tutorialInstructionBox: TutorialInstructionBox
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
  private rng: SeededRng = new SeededRng(0)
  private lastSeed: GameSeed = { value: 0 }
  private autoPlace = false
  private startAsDaily = false
  private tutorialController: TutorialController | null = null

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

        case 'TUTORIAL': {
          app.hidePlanUI()
          const tc = new TutorialController({
            app,
            intentManager: this.deps.intentManager,
            tileCentersApi: this.deps.tileCentersApi,
            navApi: this.deps.navApi,
            instructionBox: this.deps.tutorialInstructionBox,
          })
          tc.onTutorialDone = () => {
            this.startAsDaily = true
            this.actor.send({ type: 'TUTORIAL_DONE' })
          }
          this.tutorialController = tc
          tc.start()
          break
        }

        case 'CARD_PICK': {
          if (this.startAsDaily) {
            this.startAsDaily = false
            this.isNewGame = true
            this.lastSeed = { value: dailySeed(), autoPlace: true }
            this.rng = new SeededRng(this.lastSeed.value)
            this.autoPlace = true
          }
          if (this.isNewGame) {
            this.isNewGame = false
            this.deps.intentManager.resetPlan(emptyPlan())
            resetGameState(gameState)
          }
          app.hidePlanUI()
          void this.runCardPickSequence(STARTING_CARD_KINDS).then(async () => {
            const spawned = this.planCrateBatch()
            await app.runBatchCrateArrival(spawned)
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
          const plan = this.deps.intentManager.getPlan()
          const derived = app.getDerived()
          const crateIds = Object.keys(plan.crates).map(Number)
          const completionBonus =
            crateIds.length > 0 && crateIds.every((id) => derived.deliveredCrates.has(id)) ? 500 : 0
          void app.enterAnimateMode(async (stats) => {
            app.advancePlanToNextTurn()

            const turnFee = 100 + 25 * gameState.turnNumber
            gameState.timecostBudget += stats.timecostEarned + completionBonus - travelCost - turnFee
            gameState.cratesDelivered += stats.cratesDelivered
            gameState.turnNumber++

            if (gameState.timecostBudget <= 0) {
              this.actor.send({ type: 'ANIMATION_DONE', outcome: 'GAME_OVER' })
              return
            }

            const spawned = this.planCrateBatch()
            await app.runBatchCrateArrival(spawned)

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
            seed: this.lastSeed.value,
          })
          break
      }
    })

    this.deps.mainMenuScreen.onStartGame = (seed: GameSeed) => {
      this.lastSeed = seed
      this.rng = new SeededRng(seed.value)
      this.autoPlace = seed.autoPlace ?? false
      this.isNewGame = true
      this.actor.send({ type: 'START_GAME' })
    }

    this.deps.mainMenuScreen.onStartTutorial = () => {
      this.actor.send({ type: 'START_TUTORIAL' })
    }

    this.deps.gameOverScreen.onRestart = () => {
      this.rng = new SeededRng(this.lastSeed.value)
      this.autoPlace = this.lastSeed.autoPlace ?? false
      this.isNewGame = true
      this.actor.send({ type: 'RESTART' })
    }

    this.deps.gameOverScreen.onMainMenu = () => {
      this.isNewGame = true
      this.actor.send({ type: 'GO_TO_MENU' })
    }

    app.onBackToMenu = () => {
      this.isNewGame = true
      this.actor.send({ type: 'GO_TO_MENU' })
    }

    this.actor.start()
  }

  private planCrateBatch(): PlannedCrate[] {
    const spawner = new CrateSpawner({
      navApi: this.deps.navApi,
      tileCentersApi: this.deps.tileCentersApi,
      intentManager: this.deps.intentManager,
      rng: this.rng,
    })
    return spawner.planBatch()
  }

  private hideAllScreens(): void {
    this.deps.mainMenuScreen.hide()
    this.deps.gameOverScreen.hide()
    this.deps.cardPickScreen.hide()
    this.tutorialController?.dispose()
    this.tutorialController = null
  }

  private async runCardPickSequence(kinds: CardKind[]): Promise<void> {
    if (this.autoPlace) {
      for (const kind of kinds) await this.executeCard(kind)
      return
    }
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
        if (this.autoPlace) this.autoPlaceVehicle('basic_car')
        else await this.deps.app.enterVehiclePlacementMode('basic_car')
        break
      case 'GET_BOAT':
        if (this.autoPlace) this.autoPlaceVehicle('small_boat')
        else await this.deps.app.enterVehiclePlacementMode('small_boat')
        break
      default:
        break
    }
  }

  private autoPlaceVehicle(vehicleTypeId: string): void {
    const { app, intentManager, navApi } = this.deps
    const vehicleType = AvailableVehicleTypes[vehicleTypeId]
    if (!vehicleType) return

    const occupied = app.getDerived().occupiedTiles
    const candidates = navApi.getLargestComponentNodeIds(vehicleType.navMesh)
      .filter((id) => !occupied.has(id))
    if (candidates.length === 0) return

    const tileId = candidates[this.rng.nextInt(candidates.length)]
    const hue = this.rng.nextInt(360)
    const vehicleNumber = Object.keys(intentManager.getPlan().vehicles).length + 1
    const name = `${vehicleTypeId === 'basic_car' ? 'Car' : 'Boat'} ${vehicleNumber}`

    intentManager.addVehicle(tileId, {
      name,
      hue,
      vehicleType,
      movementCost: vehicleType.baseMovementCost,
      capacity: vehicleType.baseCapacity,
    })
  }
}
