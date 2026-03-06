import { createMachine, assign } from 'xstate'
import { emptyLevelStats } from '../../model/types/LevelStats'
import type { LevelStats } from '../../model/types/LevelStats'

export const TURNS_PER_LEVEL = 4
export const STAMPS_GOAL = 10

export interface GameFlowContext {
  turnsRemaining: number
  levelStats: LevelStats
}

export type GameFlowEvent =
  | { type: 'START_GAME' }
  | { type: 'TO_LEVEL' }
  | { type: 'START_LEVEL_ACTION' }
  | { type: 'CONFIRM_PLAN' }
  | { type: 'ANIMATION_DONE'; stats: LevelStats }
  | { type: 'NEXT' }
  | { type: 'BACK_TO_MENU' }

export const gameFlowMachine = createMachine(
  {
    id: 'gameFlow',
    types: {} as { context: GameFlowContext; events: GameFlowEvent },
    context: {
      turnsRemaining: TURNS_PER_LEVEL,
      levelStats: emptyLevelStats(),
    },
    initial: 'MAIN_MENU',
    states: {
      MAIN_MENU: {
        on: {
          START_GAME: 'SHOP',
        },
      },
      SHOP: {
        on: {
          TO_LEVEL: 'START_LEVEL',
        },
      },
      START_LEVEL: {
        on: {
          START_LEVEL_ACTION: {
            target: 'PLAN',
            actions: assign({
              turnsRemaining: TURNS_PER_LEVEL,
              levelStats: () => emptyLevelStats(),
            }),
          },
        },
      },
      PLAN: {
        on: {
          CONFIRM_PLAN: 'ANIMATE',
        },
      },
      ANIMATE: {
        on: {
          ANIMATION_DONE: [
            {
              guard: ({ context }) => context.turnsRemaining > 1,
              target: 'PLAN',
              actions: assign({
                turnsRemaining: ({ context }) => context.turnsRemaining - 1,
                levelStats: ({ context, event }) => accumulateStats(context.levelStats, event.stats),
              }),
            },
            {
              target: 'LEVEL_EVALUATION',
              actions: assign({
                turnsRemaining: 0,
                levelStats: ({ context, event }) => accumulateStats(context.levelStats, event.stats),
              }),
            },
          ],
        },
      },
      LEVEL_EVALUATION: {
        on: {
          NEXT: 'SHOP',
          BACK_TO_MENU: 'MAIN_MENU',
        },
      },
    },
  },
)

function accumulateStats(base: LevelStats, incoming: LevelStats): LevelStats {
  return {
    cratesDelivered: base.cratesDelivered + incoming.cratesDelivered,
    pathTilesTraversed: base.pathTilesTraversed + incoming.pathTilesTraversed,
    moneyEarned: base.moneyEarned + incoming.moneyEarned,
    stampsEarned: base.stampsEarned + incoming.stampsEarned,
  }
}
