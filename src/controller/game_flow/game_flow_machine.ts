import { createMachine } from 'xstate'


export type GameFlowEvent =
  | { type: 'START_GAME' }
  | { type: 'CONFIRM_PLAN' }
  | { type: 'ANIMATION_DONE'; outcome: 'CONTINUE' | 'GAME_OVER' }
  | { type: 'RESTART' }

export const gameFlowMachine = createMachine(
  {
    id: 'gameFlow',
    types: {} as { events: GameFlowEvent },
    initial: 'MAIN_MENU',
    states: {
      MAIN_MENU: {
        on: {
          START_GAME: 'PLAN',
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
              guard: ({ event }) => event.outcome === 'CONTINUE',
              target: 'PLAN',
            },
            {
              target: 'GAME_OVER',
            },
          ],
        },
      },
      GAME_OVER: {
        on: {
          RESTART: 'PLAN',
        },
      },
    },
  },
)
