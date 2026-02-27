import type { Crate } from './Crate'
import type { Vehicle } from './Vehicle'


type TileKey = number // does nothing really, just for semantics (since tile keys are dynamically loaded from JSONL)
type TileOccupantId = number
type TileOccupant = ["CRATE" | "VEHICLE" , TileOccupantId] 

export interface Timestep {
    tileOccupations: Record<TileKey, TileOccupant>,
    transportedCargo: Record<number, number> // vehicle id, cargo crate id
}


export interface Plan {
  crates: Record<number, Crate>
  vehicles: Record<number, Vehicle>
  steps: Timestep[]
}

