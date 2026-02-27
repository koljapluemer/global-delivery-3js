
type TileKey = number // does nothing really, just for semantics (since tile keys are dynamically loaded from JSONL)
type TileOccupantId = number
type TileOccupant = ["CRATE" | "VEHICLE" , TileOccupantId] 

export type Timestep =  Record<TileKey, TileOccupant>
