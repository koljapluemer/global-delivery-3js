import type { Crate } from "./Crate"

type TileKey = number // does nothing really, just for semantics (since tile keys are dynamically loaded from JSONL)
export type Timestep =  Record<TileKey, Crate>
