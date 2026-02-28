export type PlanEvent =
  | { readonly kind: 'VEHICLE_MOVED'; readonly vehicleName: string; readonly toCountry: string | null }
  | { readonly kind: 'CRATE_LOADED'; readonly crateDestination: string; readonly vehicleName: string }
  | { readonly kind: 'CRATE_UNLOADED'; readonly crateDestination: string; readonly vehicleName: string; readonly inCountry: string | null }

export interface StepSummary {
  readonly stepIndex: number
  readonly label: string
  readonly events: readonly PlanEvent[]
}
