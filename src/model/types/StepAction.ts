/** Identifies a single mutable action within a plan step. */
export type StepAction =
  | { readonly kind: 'VEHICLE_MOVED'; readonly vehicleId: number }
  | { readonly kind: 'CRATE_LOADED'; readonly crateId: number }
  | { readonly kind: 'CRATE_UNLOADED'; readonly crateId: number }
