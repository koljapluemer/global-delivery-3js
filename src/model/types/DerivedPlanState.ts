import type { CargoIntent, JourneyIntent } from './Plan'

export interface DerivedJourneyIntent extends JourneyIntent {
  pathTileIds: number[]
  traveltime: number
}

export interface DerivedJourneyStep {
  kind: 'JOURNEY'
  stepIndex: number
  journeys: DerivedJourneyIntent[]
  stepTraveltime: number  // max across all journeys in step
}

export interface DerivedCargoAction {
  intent: CargoIntent
  valid: boolean
  invalidReason?: string
}

export interface DerivedCargoStep {
  kind: 'CARGO'
  stepIndex: number
  action: DerivedCargoAction
}

export type DerivedStep = DerivedJourneyStep | DerivedCargoStep

export interface ValidCargoActions {
  validLoads: Array<{ crateId: number; vehicleId: number }>
  validUnloads: Array<{ crateId: number; vehicleId: number; toTileId: number }>
  validDelivers: Array<{ crateId: number; vehicleId: number; toTileId: number }>
}

export interface WorldSnapshot {
  vehiclePositions: ReadonlyMap<number, number>
  crateOnGround: ReadonlyMap<number, number>
  vehicleCargo: ReadonlyMap<number, ReadonlySet<number>>
  validCargoActions: ValidCargoActions
}

export interface DerivedPlanState {
  steps: DerivedStep[]
  initialSnapshot: WorldSnapshot
  stepSnapshots: WorldSnapshot[]  // stepSnapshots[i] = state after plan.steps[i]
  deliveredCrates: ReadonlySet<number>
  totalTraveltime: number
  occupiedTiles: ReadonlySet<number>  // all tiles ever used; for placement validation
}
