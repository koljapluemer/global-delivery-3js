export interface StepEntry {
  readonly stepLabel: string
  readonly description: string
}

export interface VehicleInspection {
  readonly kind: 'VEHICLE'
  readonly name: string
  readonly location: string | null
  readonly stepEntries: readonly StepEntry[]
}

export interface CrateInspection {
  readonly kind: 'CRATE'
  readonly destinationCountry: string
  readonly location: string | null
  readonly locationNote: string | null
  readonly stepEntries: readonly StepEntry[]
}

export type InspectionContent = VehicleInspection | CrateInspection
