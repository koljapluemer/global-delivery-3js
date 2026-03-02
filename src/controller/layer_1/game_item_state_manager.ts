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
    return this.findVehicleTile(lastStep, vehicleId) ?? null
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
      case 'VEHICLE_MOVED':  this.undoVehicleMove(stepIndex, action.vehicleId); break
      case 'CRATE_LOADED':   this.undoCrateLoad(stepIndex, action.crateId);    break
      case 'CRATE_UNLOADED': this.undoCrateUnload(stepIndex, action.crateId);  break
    }
    this.pruneEmptySteps()
  }

  // ---------------------------------------------------------------------------
  // Private — per-action undo logic
  // ---------------------------------------------------------------------------

  /**
   * Revert vehicleId back to its step[i-1] tile in step[i], then cascade-undo
   * any cargo loads/unloads that depended on the vehicle being at the moved-to
   * location.
   *
   * Order:
   *   1. Fix vehicle position in step[i] FIRST — so that forward propagation
   *      inside undoCrateLoad/undoCrateUnload sees the corrected vehicle tile
   *      when testing for independent re-loads.
   *   2. Cascade cargo ops, detected from the original (pre-fix) step[i].
   */
  private undoVehicleMove(i: number, vehicleId: number): void {
    const prev = this.plan.steps[i - 1]
    const orig = this.plan.steps[i]   // snapshot for cargo-dependency detection only

    // 1. Fix vehicle position in step[i].
    const prevTile = this.findVehicleTile(prev, vehicleId)
    if (prevTile === undefined) return
    const occ = { ...orig.tileOccupations }
    for (const [tileIdStr, [kind, id]] of Object.entries(occ)) {
      if (kind === 'VEHICLE' && id === vehicleId) { delete occ[Number(tileIdStr)]; break }
    }
    occ[prevTile] = ['VEHICLE', vehicleId]
    this.plan.steps[i] = { ...orig, tileOccupations: occ }

    // 2. Cascade: crates loaded onto this vehicle at step i (detected from orig).
    for (const [crateIdStr, vId] of Object.entries(orig.transportedCargo)) {
      const crateId = Number(crateIdStr)
      if (vId === vehicleId && !(crateId in prev.transportedCargo)) {
        this.undoCrateLoad(i, crateId)
      }
    }

    // 3. Cascade: crates unloaded from this vehicle at step i (detected from orig).
    for (const [crateIdStr, vId] of Object.entries(prev.transportedCargo)) {
      const crateId = Number(crateIdStr)
      if (vId === vehicleId && !(crateId in orig.transportedCargo)) {
        this.undoCrateUnload(i, crateId)
      }
    }
  }

  /**
   * Undo a crate load in step i: remove crateId from transportedCargo and restore
   * it to the tile it occupied in step[i-1]. Then propagate forward to fix all
   * subsequent steps that carry the stale cargo state.
   */
  private undoCrateLoad(i: number, crateId: number): void {
    const prev = this.plan.steps[i - 1]
    const curr = this.plan.steps[i]

    const prevTile = this.findCrateTile(prev, crateId)
    if (prevTile === undefined) return

    const vehicleId = curr.transportedCargo[crateId]
    if (vehicleId === undefined) return

    const cargo = { ...curr.transportedCargo }
    delete cargo[crateId]
    const occ = { ...curr.tileOccupations }
    occ[prevTile] = ['CRATE', crateId]
    this.plan.steps[i] = { tileOccupations: occ, transportedCargo: cargo }

    this.propagateCrateToGround(i + 1, crateId, vehicleId, prevTile)
  }

  /**
   * Undo a crate unload in step i: remove crateId from tileOccupations and put
   * it back into transportedCargo with the vehicle that was carrying it in
   * step[i-1]. Then propagate forward to fix all subsequent steps that carry
   * the stale on-ground state.
   */
  private undoCrateUnload(i: number, crateId: number): void {
    const prev = this.plan.steps[i - 1]
    const curr = this.plan.steps[i]

    const vehicleId = prev.transportedCargo[crateId]
    if (vehicleId === undefined) return

    const occ = { ...curr.tileOccupations }
    for (const [tileIdStr, [kind, id]] of Object.entries(occ)) {
      if (kind === 'CRATE' && id === crateId) { delete occ[Number(tileIdStr)]; break }
    }
    const cargo = { ...curr.transportedCargo, [crateId]: vehicleId }
    this.plan.steps[i] = { tileOccupations: occ, transportedCargo: cargo }

    this.propagateCrateToVehicle(i + 1, crateId, vehicleId)
  }

  // ---------------------------------------------------------------------------
  // Private — forward propagation
  // ---------------------------------------------------------------------------

  /**
   * Walk forward from `startStep`, ensuring crateId appears on the ground at
   * `groundTile` (not in any cargo) in every subsequent step — until an
   * *independent* re-load is detected (the loading vehicle was co-located with
   * the crate at groundTile in the preceding step, meaning it's a deliberate
   * new action that must survive).
   */
  private propagateCrateToGround(
    startStep: number,
    crateId: number,
    vehicleId: number,
    groundTile: number,
  ): void {
    for (let j = startStep; j < this.plan.steps.length; j++) {
      const prev = this.plan.steps[j - 1]
      const curr = this.plan.steps[j]

      if (crateId in curr.transportedCargo) {
        const carrierNow = curr.transportedCargo[crateId]

        if (carrierNow !== vehicleId) {
          // A different vehicle is carrying the crate — independent transfer. Stop.
          return
        }

        // Same vehicle. Independent load iff the vehicle was co-located with the
        // crate at groundTile in the preceding (already-fixed) step.
        const prevVehicleTile = this.findVehicleTile(prev, vehicleId)
        const prevCrateTile   = this.findCrateTile(prev, crateId)
        if (prevVehicleTile !== undefined && prevVehicleTile === prevCrateTile) {
          // Vehicle was on the crate's tile — genuine new load action. Stop.
          return
        }

        // Stale carry-forward: remove from cargo, restore crate to ground.
        const cargo = { ...curr.transportedCargo }
        delete cargo[crateId]
        const occ = { ...curr.tileOccupations, [groundTile]: ['CRATE', crateId] as ['CRATE', number] }
        this.plan.steps[j] = { tileOccupations: occ, transportedCargo: cargo }

      } else {
        const crateTile = this.findCrateTile(curr, crateId)
        if (crateTile === undefined) return  // crate disappeared — stop

        if (crateTile === groundTile) continue  // already correct; keep scanning for later stale steps

        // Crate is on a wrong tile — orphaned unload artifact. Fix it.
        const occ = { ...curr.tileOccupations }
        delete occ[crateTile]
        occ[groundTile] = ['CRATE', crateId]
        this.plan.steps[j] = { ...curr, tileOccupations: occ }
      }
    }
  }

  /**
   * Walk forward from `startStep`, ensuring crateId stays in `vehicleId`'s
   * transportedCargo in every subsequent step — until an *independent* unload is
   * detected (the vehicle was co-located with the drop tile in the preceding
   * step) or another vehicle takes the crate.
   */
  private propagateCrateToVehicle(
    startStep: number,
    crateId: number,
    vehicleId: number,
  ): void {
    for (let j = startStep; j < this.plan.steps.length; j++) {
      const prev = this.plan.steps[j - 1]
      const curr = this.plan.steps[j]

      if (crateId in curr.transportedCargo) {
        if (curr.transportedCargo[crateId] !== vehicleId) {
          // A different vehicle has taken the crate — independent transfer. Stop.
          return
        }
        // Correct carry-forward. Continue.
        continue
      }

      const crateTile = this.findCrateTile(curr, crateId)
      if (crateTile === undefined) return  // crate disappeared — stop

      // Crate is on the ground. Independent unload iff the vehicle was at the
      // drop tile in the preceding (already-fixed) step.
      const prevVehicleTile = this.findVehicleTile(prev, vehicleId)
      if (prevVehicleTile === crateTile) {
        // Vehicle was at the drop tile — genuine new unload action. Stop.
        return
      }

      // Stale orphaned unload: remove from ground, restore to cargo.
      const occ = { ...curr.tileOccupations }
      delete occ[crateTile]
      const cargo = { ...curr.transportedCargo, [crateId]: vehicleId }
      this.plan.steps[j] = { tileOccupations: occ, transportedCargo: cargo }
    }
  }

  // ---------------------------------------------------------------------------
  // Private — pruning and comparison
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Private — tile-finding helpers
  // ---------------------------------------------------------------------------

  private findVehicleTile(step: Timestep, vehicleId: number): number | undefined {
    for (const [tileIdStr, [kind, id]] of Object.entries(step.tileOccupations)) {
      if (kind === 'VEHICLE' && id === vehicleId) return Number(tileIdStr)
    }
    return undefined
  }

  private findCrateTile(step: Timestep, crateId: number): number | undefined {
    for (const [tileIdStr, [kind, id]] of Object.entries(step.tileOccupations)) {
      if (kind === 'CRATE' && id === crateId) return Number(tileIdStr)
    }
    return undefined
  }
}
