import type { Crate } from './Crate'
import type { Vehicle } from './Vehicle'
import type { Timestep } from './Timestep'

export interface Plan {
  crates: Record<number, Crate>
  vehicles: Record<number, Vehicle>
  steps: Timestep[]
}
