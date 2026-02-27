import type { Vehicle } from './Vehicle'
import type { Timestep } from './Timestep'

export interface Plan {
  vehicles: Record<number, Vehicle>
  steps: Timestep[]
}
