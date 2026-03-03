export interface JourneyStepEntry {
  kind: 'JOURNEY'
  stepIndex: number
  vehicleId: number
  stepLabel: string
  description: string
}

export interface CargoStepEntry {
  kind: 'CARGO'
  stepIndex: number
  actionIndex: number
  stepLabel: string
  description: string
  valid: boolean
}

export type StepEntry = JourneyStepEntry | CargoStepEntry

export interface VehicleInspection {
  readonly kind: 'VEHICLE'
  readonly name: string
  readonly location: string | null
  readonly stepEntries: readonly StepEntry[]
}

export interface CrateInspection {
  readonly kind: 'CRATE'
  readonly destinationCountry: string
  readonly rewardMoney: number
  readonly rewardStamps: number
  readonly location: string | null
  readonly locationNote: string | null
  readonly stepEntries: readonly StepEntry[]
}

export type InspectionContent = VehicleInspection | CrateInspection
