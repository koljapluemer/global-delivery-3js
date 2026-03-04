import type { Crate } from './Crate'
import type { Vehicle } from './Vehicle'

export interface InitialState {
  vehiclePositions: Record<number, number>  // vehicleId → tileId
  cratePositions: Record<number, number>    // crateId → tileId
}

export interface JourneyIntent {
  vehicleId: number
  toTileId: number
}

export interface JourneyStep {
  kind: 'JOURNEY'
  journeys: JourneyIntent[]  // at most one per vehicle
}

export type CargoIntent =
  | { kind: 'LOAD';     crateId: number; vehicleId: number }
  | { kind: 'UNLOAD';   crateId: number; vehicleId: number; toTileId: number }
  | { kind: 'DELIVER';  crateId: number; vehicleId: number; toTileId: number }

export interface CargoStep {
  kind: 'CARGO'
  action: CargoIntent
}

export type PlanStep = JourneyStep | CargoStep

export interface Plan {
  vehicles: Record<number, Vehicle>
  crates: Record<number, Crate>
  initialState: InitialState
  steps: PlanStep[]
}
