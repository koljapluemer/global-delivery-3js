import { createMachine, assign } from 'xstate'

export interface InputModeContext {
  vehicleId?: number
  stepIndex?: number
  crateId?: number
  crateTileId?: number
  fromTileId?: number
  nextTileId?: number
  toTileId?: number
  insertAfterStepIndex?: number
  prevTileId?: number
  lastValidLoadTarget: { vehicleId: number; insertAfterStepIndex: number } | null
  lastValidUnloadTarget: { toTileId: number; isDelivery: boolean; insertAfterStepIndex: number } | null
}

export type InputModeEvent =
  | { type: 'CANCEL' }
  | { type: 'POINTER_DOWN_PIN'; vehicleId: number; stepIndex: number; prevTileId: number; nextTileId?: number }
  | { type: 'POINTER_DOWN_ROUTE_LINE'; vehicleId: number; insertAfterStepIndex: number; fromTileId: number; toTileId: number }
  | {
      type: 'POINTER_UP'
      isDrag: boolean
      tile?: { tile_id: number }
      hitVehicleId?: number
      hitCrateId?: number
      hitStepIndex?: number
      hitCrateTileId?: number
      hitInvalidStepIndex?: number
      clientX?: number
      clientY?: number
    }
  | { type: 'CONFIRM_PIN_PLACEMENT'; vehicleId: number; fromTileId: number }
  | { type: 'ENTER_PIN_PLACEMENT'; vehicleId: number; fromTileId: number; insertAfterStepIndex?: number }
  | { type: 'ENTER_CRATE_DROP'; vehicleId: number; stepIndex: number; crateId: number }
  | { type: 'ENTER_CRATE_LOAD'; crateId: number; stepIndex: number; crateTileId: number }
  | { type: 'UPDATE_LOAD_TARGET'; payload: { vehicleId: number; insertAfterStepIndex: number } | null }
  | { type: 'UPDATE_UNLOAD_TARGET'; payload: InputModeContext['lastValidUnloadTarget'] }
  | { type: 'SELECT_VEHICLE'; vehicleId: number }
  | { type: 'OPEN_CRATE_LOAD_MENU'; crateId: number; stepIndex: number; crateTileId: number; clientX: number; clientY: number }
  | { type: 'REMOVE_INVALID_INTENT'; stepIndex: number }
  | { type: 'HIDE_INSPECTOR' }
  | { type: 'CONFIRM_CRATE_DROP' }
  | { type: 'CONFIRM_CRATE_LOAD' }
  | { type: 'CONFIRM_PIN_DRAG' }
  | { type: 'CONFIRM_ROUTE_SPLIT' }

export type InputModeState =
  | { value: 'normal'; context: InputModeContext }
  | { value: 'pinPlacement'; context: InputModeContext }
  | { value: 'pinDrag'; context: InputModeContext }
  | { value: 'routeSplit'; context: InputModeContext }
  | { value: 'crateDrop'; context: InputModeContext }
  | { value: 'crateLoad'; context: InputModeContext }

export const inputModeMachine = createMachine({
  id: 'inputMode',
  types: {} as {
    context: InputModeContext
    events: InputModeEvent
  },
  context: {
    lastValidLoadTarget: null,
    lastValidUnloadTarget: null,
  },
  initial: 'normal',
  states: {
    normal: {
      on: {
        ENTER_PIN_PLACEMENT: {
          target: 'pinPlacement',
          actions: assign({
            vehicleId: ({ event }) => ('vehicleId' in event ? event.vehicleId : undefined),
            fromTileId: ({ event }) => ('fromTileId' in event ? event.fromTileId : undefined),
            insertAfterStepIndex: ({ event }) => ('insertAfterStepIndex' in event ? event.insertAfterStepIndex : undefined),
          }),
        },
        POINTER_DOWN_PIN: {
          target: 'pinDrag',
          actions: assign({
            vehicleId: ({ event }) => event.vehicleId,
            stepIndex: ({ event }) => event.stepIndex,
            prevTileId: ({ event }) => event.prevTileId,
            nextTileId: ({ event }) => event.nextTileId,
          }),
        },
        POINTER_DOWN_ROUTE_LINE: {
          target: 'routeSplit',
          actions: assign({
            vehicleId: ({ event }) => event.vehicleId,
            insertAfterStepIndex: ({ event }) => event.insertAfterStepIndex,
            fromTileId: ({ event }) => event.fromTileId,
            toTileId: ({ event }) => event.toTileId,
          }),
        },
        ENTER_CRATE_DROP: {
          target: 'crateDrop',
          actions: assign({
            vehicleId: ({ event }) => ('vehicleId' in event ? event.vehicleId : undefined),
            stepIndex: ({ event }) => ('stepIndex' in event ? event.stepIndex : undefined),
            crateId: ({ event }) => ('crateId' in event ? event.crateId : undefined),
          }),
        },
        ENTER_CRATE_LOAD: {
          target: 'crateLoad',
          actions: assign({
            crateId: ({ event }) => event.crateId,
            stepIndex: ({ event }) => event.stepIndex,
            crateTileId: ({ event }) => event.crateTileId,
          }),
        },
        SELECT_VEHICLE: undefined,
        OPEN_CRATE_LOAD_MENU: undefined,
        REMOVE_INVALID_INTENT: undefined,
        HIDE_INSPECTOR: undefined,
      },
    },
    pinPlacement: {
      on: {
        CANCEL: 'normal',
        CONFIRM_PIN_PLACEMENT: 'normal',
      },
    },
    pinDrag: {
      on: {
        POINTER_UP: 'normal',
        CONFIRM_PIN_DRAG: 'normal',
      },
    },
    routeSplit: {
      on: {
        POINTER_UP: 'normal',
        CONFIRM_ROUTE_SPLIT: 'normal',
      },
    },
    crateDrop: {
      on: {
        CANCEL: 'normal',
        CONFIRM_CRATE_DROP: 'normal',
        UPDATE_UNLOAD_TARGET: {
          actions: assign({ lastValidUnloadTarget: ({ event }) => ('payload' in event ? event.payload : null) }),
        },
      },
    },
    crateLoad: {
      on: {
        CANCEL: 'normal',
        CONFIRM_CRATE_LOAD: 'normal',
        UPDATE_LOAD_TARGET: {
          actions: assign({ lastValidLoadTarget: ({ event }) => ('payload' in event ? event.payload : null) }),
        },
      },
    },
  },
})

/** Resolve XState v5 snapshot value to a string (root state name). */
export function inputStateValue(snapshot: { value: unknown }): string {
  const v = snapshot.value
  return typeof v === 'object' && v !== null && 'value' in v ? (v as { value: string }).value : String(v)
}
