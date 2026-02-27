import type { Crate } from "./Crate"
import type { Vehicle } from "./Vehicle"

type TileKey = number // does nothing really, just for semantics (since tile keys are dynamically loaded from JSONL)
type TileOccupant = Crate | Vehicle

export type Timestep =  Record<TileKey, TileOccupant>
