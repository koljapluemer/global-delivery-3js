import type { DerivedPlanState } from '../model/types/DerivedPlanState'

/** Serialize derived snapshots to a JSON-serializable object and trigger download. */
export function downloadDerivedSnapshots(derived: DerivedPlanState): void {
  const snap = (m: ReadonlyMap<number, number>) =>
    Object.fromEntries([...m.entries()].map(([k, v]) => [String(k), v]))
  const cargo = (m: ReadonlyMap<number, ReadonlySet<number>>) =>
    Object.fromEntries([...m.entries()].map(([k, v]) => [String(k), [...v]]))
  const snapshotToJson = (s: DerivedPlanState['initialSnapshot']) => ({
    vehiclePositions: snap(s.vehiclePositions),
    crateOnGround: snap(s.crateOnGround),
    vehicleCargo: cargo(s.vehicleCargo),
    validCargoActions: s.validCargoActions,
  })
  const payload = {
    initialSnapshot: snapshotToJson(derived.initialSnapshot),
    stepSnapshots: derived.stepSnapshots.map(snapshotToJson),
    deliveredCrates: [...derived.deliveredCrates],
    totalTraveltime: derived.totalTraveltime,
    occupiedTiles: [...derived.occupiedTiles],
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `derived-snapshots-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
