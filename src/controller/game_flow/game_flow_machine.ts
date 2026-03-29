import { createMachine } from 'xstate'


export type GameFlowEvent =
  | { type: 'START_GAME' }
  | { type: 'START_TUTORIAL' }
  | { type: 'TUTORIAL_DONE' }
  | { type: 'CARD_PICK_DONE' }
  | { type: 'CONFIRM_PLAN' }
  | { type: 'ANIMATION_DONE'; outcome: 'CONTINUE' | 'GAME_OVER' }
  | { type: 'RESTART' }
  | { type: 'GO_TO_MENU' }

export const gameFlowMachine = createMachine(
  {
    id: 'gameFlow',
    types: {} as { events: GameFlowEvent },
    initial: 'MAIN_MENU',
    states: {
      MAIN_MENU: {
        on: {
          START_GAME: 'CARD_PICK',
          START_TUTORIAL: 'TUTORIAL',
        },
      },
      TUTORIAL: {
        on: {
          TUTORIAL_DONE: 'CARD_PICK',
          GO_TO_MENU: 'MAIN_MENU',
        },
      },
      CARD_PICK: {
        on: {
          CARD_PICK_DONE: 'PLAN',
        },
      },
      PLAN: {
        on: {
          CONFIRM_PLAN: 'ANIMATE',
          GO_TO_MENU: 'MAIN_MENU',
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
          RESTART: 'CARD_PICK',
          GO_TO_MENU: 'MAIN_MENU',
        },
      },
    },
  },
)
