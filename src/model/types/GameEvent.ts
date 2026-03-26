export type GameEvent =
  | { kind: 'CRATE_DELIVERED'; countryName: string; reward: number }
  | { kind: 'VEHICLE_ARRIVED'; vehicleName: string; countryName: string }
  | { kind: 'INVALID_ACTION'; message: string }
