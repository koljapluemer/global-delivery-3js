import type { StepAction } from '../../../model/types/StepAction'

export interface StepEntry {
  readonly stepLabel: string
  readonly description: string
  readonly stepIndex: number
  readonly action: StepAction
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
  readonly rewardMoney: number
  readonly rewardStamps: number
  readonly location: string | null
  readonly locationNote: string | null
  readonly stepEntries: readonly StepEntry[]
}

export type InspectionContent = VehicleInspection | CrateInspection
