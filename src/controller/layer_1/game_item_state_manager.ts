import type { Plan, Timestep } from '../../model/types/Plan'
import type { StepAction } from '../../model/types/StepAction'
import type { NavApi } from '../navigation'

export class GameItemStateManager {
  private readonly plan: Plan
  private readonly navApi: NavApi

  constructor(plan: Plan, navApi: NavApi) {
    this.plan = plan
    this.navApi = navApi
  }

  getPlan(): Plan { return this.plan }

  getStepAtIndex(i: number): Timestep { return this.plan.steps[i] }

  /** Returns the tile ID of vehicleId in the last step, or null if not found. */
  getVehicleLastTileId(vehicleId: number): number | null {
    const lastStep = this.plan.steps[this.plan.steps.length - 1]
    if (!lastStep) return null
    return this.findVehicleTile(lastStep, vehicleId) ?? null
  }

  /** Returns vehicleId's tile in plan.steps[stepIndex], or undefined if not found. */
  getVehicleTileAtStep(vehicleId: number, stepIndex: number): number | undefined {
    const step = this.plan.steps[stepIndex]
    if (!step) return undefined
    return this.findVehicleTile(step, vehicleId)
  }

  /**
   * Move vehicleId's destination in step[stepIndex] to newTileId.
   * Cascades any cargo loads/unloads that depended on the old position, then prunes.
   */
  moveVehicleStep(vehicleId: number, stepIndex: number, newTileId: number): void {
    if (stepIndex < 1 || stepIndex >= this.plan.steps.length) return
    this.applyVehicleMove(stepIndex, vehicleId, newTileId)
    this.pruneEmptySteps()
  }

  /**
   * Insert a new step after afterStepIndex with vehicleId at newTileId.
   * Copies all other occupants and cargo from the base step. No cascade needed.
   */
  insertVehicleStep(vehicleId: number, afterStepIndex: number, newTileId: number): void {
    if (afterStepIndex < 0 || afterStepIndex >= this.plan.steps.length) return
    const base = this.plan.steps[afterStepIndex]
    const occ = { ...base.tileOccupations }
    for (const [k, [kind, id]] of Object.entries(occ)) {
      if (kind === 'VEHICLE' && id === vehicleId) { delete occ[Number(k)]; break }
    }
    occ[newTileId] = ['VEHICLE', vehicleId]
    this.plan.steps.splice(afterStepIndex + 1, 0,
      { tileOccupations: occ, transportedCargo: { ...base.transportedCargo } })
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
   * Drop crateId to tileId at step[stepIndex], removing it from the vehicle's cargo.
   * Propagates forward so subsequent steps reflect the crate being on the ground.
   */
  addCrateUnload(stepIndex: number, crateId: number, tileId: number): void {
    if (stepIndex < 0 || stepIndex >= this.plan.steps.length) return
    const curr = this.plan.steps[stepIndex]
    const vehicleId = curr.transportedCargo[crateId]
    if (vehicleId === undefined) return

    const cargo = { ...curr.transportedCargo }
    delete cargo[crateId]
    const occ = { ...curr.tileOccupations, [tileId]: ['CRATE', crateId] as ['CRATE', number] }
    this.plan.steps[stepIndex] = { tileOccupations: occ, transportedCargo: cargo }

    this.propagateCrateToGround(stepIndex + 1, crateId, vehicleId, tileId)
    this.pruneEmptySteps()
  }

  /**
   * Load crateId onto vehicleId at step[stepIndex], removing it from the ground.
   * Propagates forward so subsequent steps reflect the crate being carried.
   */
  addCrateLoad(stepIndex: number, crateId: number, vehicleId: number): void {
    if (stepIndex < 0 || stepIndex >= this.plan.steps.length) return
    const curr = this.plan.steps[stepIndex]
    const crateTile = this.findCrateTile(curr, crateId)
    if (crateTile === undefined) return
    const vehicleTile = this.findVehicleTile(curr, vehicleId)
    if (vehicleTile === undefined) return
    const navMesh = this.plan.vehicles[vehicleId]?.vehicleType.navMesh
    if (!navMesh || !this.navApi.getNeighbors(crateTile, navMesh).includes(vehicleTile)) return

    const occ = { ...curr.tileOccupations }
    delete occ[crateTile]
    const cargo = { ...curr.transportedCargo, [crateId]: vehicleId }
    this.plan.steps[stepIndex] = { tileOccupations: occ, transportedCargo: cargo }
    this.propagateCrateToVehicle(stepIndex + 1, crateId, vehicleId)
    this.pruneEmptySteps()
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

  /** Revert vehicleId to its step[i-1] tile. Used by removeAction internally. */
  private undoVehicleMove(i: number, vehicleId: number): void {
    const prevTile = this.findVehicleTile(this.plan.steps[i - 1], vehicleId)
    if (prevTile === undefined) return
    this.applyVehicleMove(i, vehicleId, prevTile)
  }

  /**
   * Core vehicle-move mutation: set vehicleId's tile in step[stepIndex] to newTileId,
   * then cascade-undo cargo loads/unloads that depended on the old position.
   *
   * Steps vehicle position FIRST (so forward propagation inside undoCrateLoad/
   * undoCrateUnload sees the corrected tile when testing for independent re-loads).
   * Cargo cascade is skipped when position didn't actually change.
   */
  private applyVehicleMove(stepIndex: number, vehicleId: number, newTileId: number): void {
    const orig = this.plan.steps[stepIndex]   // snapshot for cargo-dependency detection
    const prev = this.plan.steps[stepIndex - 1]

    // 1. Set vehicle to newTileId.
    const currentTile = this.findVehicleTile(orig, vehicleId)
    const occ = { ...orig.tileOccupations }
    if (currentTile !== undefined) delete occ[currentTile]
    occ[newTileId] = ['VEHICLE', vehicleId]
    this.plan.steps[stepIndex] = { ...orig, tileOccupations: occ }

    // 2. Cascade cargo only when the position actually changed.
    if (newTileId === currentTile) return

    for (const [crateIdStr, vId] of Object.entries(orig.transportedCargo)) {
      const crateId = Number(crateIdStr)
      if (vId === vehicleId && !(crateId in prev.transportedCargo)) {
        this.undoCrateLoad(stepIndex, crateId)
      }
    }
    for (const [crateIdStr, vId] of Object.entries(prev.transportedCargo)) {
      const crateId = Number(crateIdStr)
      if (vId === vehicleId && !(crateId in orig.transportedCargo)) {
        this.undoCrateUnload(stepIndex, crateId)
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
   * *independent* re-load is detected (the preceding step did NOT have the crate
   * in cargo, meaning it appeared in cargo without a prior carry → genuine new
   * user load that must survive).
   */
  private propagateCrateToGround(
    startStep: number,
    crateId: number,
    vehicleId: number,
    groundTile: number,
  ): void {
    // The step just before startStep was just modified to REMOVE cargo; its original
    // state DID have cargo — that's why we're propagating. Start with true.
    let prevOriginallyHadCargo = true

    for (let j = startStep; j < this.plan.steps.length; j++) {
      const curr = this.plan.steps[j]

      if (crateId in curr.transportedCargo) {
        if (curr.transportedCargo[crateId] !== vehicleId) { return }  // different vehicle: stop
        if (!prevOriginallyHadCargo) { return }                        // genuine new load: stop

        // Stale carry-forward: remove from cargo, restore crate to ground.
        const cargo = { ...curr.transportedCargo }
        delete cargo[crateId]
        const occ = { ...curr.tileOccupations, [groundTile]: ['CRATE', crateId] as ['CRATE', number] }
        this.plan.steps[j] = { tileOccupations: occ, transportedCargo: cargo }
        prevOriginallyHadCargo = true  // curr originally had cargo

      } else {
        const crateTile = this.findCrateTile(curr, crateId)
        if (crateTile === undefined) return           // crate gone: stop
        if (crateTile === groundTile) { prevOriginallyHadCargo = false; continue }

        // Wrong tile — orphaned unload artifact: fix it.
        const occ = { ...curr.tileOccupations }
        delete occ[crateTile]
        occ[groundTile] = ['CRATE', crateId]
        this.plan.steps[j] = { ...curr, tileOccupations: occ }
        prevOriginallyHadCargo = false  // curr originally had crate on ground
      }
    }
  }

  /**
   * Walk forward from `startStep`, ensuring crateId stays in `vehicleId`'s
   * transportedCargo in every subsequent step — until an *independent* unload is
   * detected (the vehicle is adjacent to the drop tile in the current step,
   * meaning this is a deliberate unload action) or another vehicle takes the crate.
   */
  private propagateCrateToVehicle(
    startStep: number,
    crateId: number,
    vehicleId: number,
  ): void {
    for (let j = startStep; j < this.plan.steps.length; j++) {
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

      // Crate is on the ground. Independent unload iff the vehicle is adjacent
      // to the drop tile in the current step.
      const currVehicleTile = this.findVehicleTile(curr, vehicleId)
      const navMesh = this.plan.vehicles[vehicleId]?.vehicleType.navMesh
      if (currVehicleTile !== undefined && navMesh !== undefined &&
          this.navApi.getNeighbors(crateTile, navMesh).includes(currVehicleTile)) {
        // Vehicle is adjacent to drop tile in current step — genuine unload: stop.
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
