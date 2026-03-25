import type { CardDefinition, CardKind } from '../types/Card'
import carUrl from '../../assets/cards/card_car.svg?url'
import boatUrl from '../../assets/cards/card_boat.svg?url'
import timeUrl from '../../assets/cards/card_plus_time.svg?url'
import crateUrl from '../../assets/cards/card_plus_shape.svg?url'

export const CARD_DEFINITIONS: Record<CardKind, CardDefinition> = {
  GET_CAR: {
    kind: 'GET_CAR',
    label: 'Get a Car',
    description: 'Place a car on land',
    svgUrl: carUrl,
  },
  GET_BOAT: {
    kind: 'GET_BOAT',
    label: 'Get a Boat',
    description: 'Place a boat on water',
    svgUrl: boatUrl,
  },
  GET_TIME: {
    kind: 'GET_TIME',
    label: '+500 Time',
    description: 'Add 500 time to your budget',
    svgUrl: timeUrl,
  },
  GET_CRATE: {
    kind: 'GET_CRATE',
    label: 'Extra Crate',
    description: 'A new crate is dropped nearby',
    svgUrl: crateUrl,
  },
}

export const STARTING_CARD_KINDS: CardKind[] = ['GET_BOAT', 'GET_CAR']
