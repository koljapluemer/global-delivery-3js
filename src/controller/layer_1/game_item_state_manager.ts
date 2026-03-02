import type { Plan, Timestep } from '../../model/types/Plan'
import type { StepAction } from '../../model/types/StepAction'

export class GameItemStateManager {
  private readonly plan: Plan

  constructor(plan: Plan) {
    this.plan = plan
  }

  getPlan(): Plan { return this.plan }

  getStepAtIndex(i: number): Timestep { return this.plan.steps[i] }

  /** Returns the tile ID of vehicleId in the last step, or null if not found. */
  getVehicleLastTileId(vehicleId: number): number | null {
    const lastStep = this.plan.steps[this.plan.steps.length - 1]
    if (!lastStep) return null
    for (const [tileIdStr, [kind, id]] of Object.entries(lastStep.tileOccupations)) {
      if (kind === 'VEHICLE' && id === vehicleId) return Number(tileIdStr)
    }
    return null
  }

  /** Appends a new Timestep moving vehicleId to toTileId, copying all other occupants and cargo. */
  addVehicleStep(vehicleId: number, toTileId: number): void {
    const lastStep = this.plan.steps[this.plan.steps.length - 1]
    if (!lastStep) return
    const newOccupations = { ...lastStep.tileOccupations }
    for (const [tileIdStr, [kind, id]] of Object.entries(newOccupations)) {
      if (kind === 'VEHICLE' && id === vehicleId) { delete newOccupations[Number(tileIdStr)]; break }
    }
    newOccupations[toTileId] = ['VEHICLE', vehicleId]
    this.plan.steps.push({ tileOccupations: newOccupations, transportedCargo: { ...lastStep.transportedCargo } })
  }

  /**
   * Undo a single action within a step, then auto-prune any steps that became
   * identical to their predecessor (no change = no action = no step needed).
   */
  removeAction(stepIndex: number, action: StepAction): void {
    if (stepIndex < 1 || stepIndex >= this.plan.steps.length) return
    switch (action.kind) {
      case 'VEHICLE_MOVED': this.undoVehicleMove(stepIndex, action.vehicleId); break
      case 'CRATE_LOADED':  this.undoCrateLoad(stepIndex, action.crateId);   break
      case 'CRATE_UNLOADED': this.undoCrateUnload(stepIndex, action.crateId); break
    }
    this.pruneEmptySteps()
  }

  // ---------------------------------------------------------------------------
  // Private — per-action undo logic
  // ---------------------------------------------------------------------------

  /**
   * Revert vehicleId back to its step[i-1] tile in step[i].
   * This makes the vehicle "not move" in step i.
   */
  private undoVehicleMove(i: number, vehicleId: number): void {
    const prev = this.plan.steps[i - 1]
    const curr = this.plan.steps[i]

    // Find vehicle's tile in the previous step
    let prevTile: number | undefined
    for (const [tileIdStr, [kind, id]] of Object.entries(prev.tileOccupations)) {
      if (kind === 'VEHICLE' && id === vehicleId) { prevTile = Number(tileIdStr); break }
    }
    if (prevTile === undefined) return

    // Remove vehicle from its current tile in step i, restore it to prevTile
    const occ = { ...curr.tileOccupations }
    for (const [tileIdStr, [kind, id]] of Object.entries(occ)) {
      if (kind === 'VEHICLE' && id === vehicleId) { delete occ[Number(tileIdStr)]; break }
    }
    occ[prevTile] = ['VEHICLE', vehicleId]
    this.plan.steps[i] = { ...curr, tileOccupations: occ }
  }

  /**
   * Undo a crate load in step i: remove crateId from transportedCargo and restore
   * it to the tile it occupied in step[i-1].
   */
  private undoCrateLoad(i: number, crateId: number): void {
    const prev = this.plan.steps[i - 1]
    const curr = this.plan.steps[i]

    // Find the crate's tile in the previous step
    let prevTile: number | undefined
    for (const [tileIdStr, [kind, id]] of Object.entries(prev.tileOccupations)) {
      if (kind === 'CRATE' && id === crateId) { prevTile = Number(tileIdStr); break }
    }
    if (prevTile === undefined) return

    const cargo = { ...curr.transportedCargo }
    delete cargo[crateId]
    const occ = { ...curr.tileOccupations }
    occ[prevTile] = ['CRATE', crateId]
    this.plan.steps[i] = { tileOccupations: occ, transportedCargo: cargo }
  }

  /**
   * Undo a crate unload in step i: remove crateId from tileOccupations and put
   * it back into transportedCargo with the vehicle that was carrying it in step[i-1].
   */
  private undoCrateUnload(i: number, crateId: number): void {
    const prev = this.plan.steps[i - 1]
    const curr = this.plan.steps[i]

    // The carrying vehicle is whoever had this crate in the previous step
    const vehicleId = prev.transportedCargo[crateId]
    if (vehicleId === undefined) return

    const occ = { ...curr.tileOccupations }
    for (const [tileIdStr, [kind, id]] of Object.entries(occ)) {
      if (kind === 'CRATE' && id === crateId) { delete occ[Number(tileIdStr)]; break }
    }
    const cargo = { ...curr.transportedCargo, [crateId]: vehicleId }
    this.plan.steps[i] = { tileOccupations: occ, transportedCargo: cargo }
  }

  /**
   * Remove any step i (i >= 1) whose tileOccupations and transportedCargo are
   * identical to step[i-1] — iterate in reverse to keep indices stable.
   */
  private pruneEmptySteps(): void {
    for (let i = this.plan.steps.length - 1; i >= 1; i--) {
      if (this.stepsAreEqual(this.plan.steps[i - 1], this.plan.steps[i])) {
        this.plan.steps.splice(i, 1)
      }
    }
  }

  private stepsAreEqual(a: Timestep, b: Timestep): boolean {
    const sortedEntries = (obj: object) =>
      JSON.stringify(Object.entries(obj).map(([k, v]) => [k, v]).sort())
    return (
      sortedEntries(a.tileOccupations) === sortedEntries(b.tileOccupations) &&
      sortedEntries(a.transportedCargo) === sortedEntries(b.transportedCargo)
    )
  }
}
