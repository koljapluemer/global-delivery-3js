export type CardKind = 'GET_CAR' | 'GET_BOAT' | 'GET_TIME' | 'GET_CRATE'

export interface CardDefinition {
  kind: CardKind
  label: string
  description: string
  svgUrl: string
}
