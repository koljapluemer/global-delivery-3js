import type { Plan, PlanStep, JourneyStep, JourneyIntent, CargoStep, CargoIntent } from '../model/types/Plan'
import type { Crate } from '../model/types/Crate'
import type { Vehicle } from '../model/types/Vehicle'

export class PlanIntentManager {
  private plan: Plan

  constructor(plan: Plan) { this.plan = plan }

  getPlan(): Plan { return this.plan }
  resetPlan(plan: Plan): void {
    this.plan = plan
    this.pruneAndMerge()
  }

  /** Add a new vehicle at tileId. Returns the new vehicleId. */
  addVehicle(tileId: number, vehicle: Vehicle): number {
    const ids = Object.keys(this.plan.vehicles).map(Number)
    const newId = ids.length > 0 ? Math.max(...ids) + 1 : 0
    this.plan.vehicles[newId] = vehicle
    this.plan.initialState.vehiclePositions[newId] = tileId
    return newId
  }

  /** Add a new crate on the ground at tileId. Returns the new crateId. */
  addGroundCrate(tileId: number, crate: Crate): number {
    const ids = Object.keys(this.plan.crates).map(Number)
    const newId = ids.length > 0 ? Math.max(...ids) + 1 : 0
    this.plan.crates[newId] = crate
    this.plan.initialState.cratePositions[newId] = tileId
    return newId
  }

  // ---------------------------------------------------------------------------
  // Journey intents
  // ---------------------------------------------------------------------------

  /** Last step index (0-based) where this vehicle is involved (journey or cargo), or -1 if never. */
  getLastStepIndexInvolvingVehicle(vehicleId: number): number {
    let last = -1
    for (let i = 0; i < this.plan.steps.length; i++) {
      const step = this.plan.steps[i]
      if (step.kind === 'JOURNEY') {
        if (step.journeys.some((j) => j.vehicleId === vehicleId)) last = i
      } else {
        const a = step.action
        if ((a.kind === 'LOAD' || a.kind === 'UNLOAD' || a.kind === 'DELIVER') && a.vehicleId === vehicleId) last = i
      }
    }
    return last
  }

  /** Insert a new journey (pin) for vehicleId → toTileId directly after the last step involving this vehicle. */
  addPinAfterLastVehicleStep(vehicleId: number, toTileId: number): number {
    const afterIndex = this.getLastStepIndexInvolvingVehicle(vehicleId)
    return this.addOrMergeJourneyAfter(afterIndex, vehicleId, toTileId)
  }

  /** Update destination of an existing journey intent. */
  updateJourneyTarget(stepIndex: number, vehicleId: number, newTileId: number): void {
    const step = this.plan.steps[stepIndex]
    if (!step || step.kind !== 'JOURNEY') return
    const journey = step.journeys.find((j) => j.vehicleId === vehicleId)
    if (journey) journey.toTileId = newTileId
  }

  /** Move a vehicle's journey intent into the slot after toAfterStepIndex.
   *  Uses the first journey step in that slot if it has no intent for this vehicle; otherwise inserts a new step. */
  moveJourneyIntent(vehicleId: number, fromStepIndex: number, toAfterStepIndex: number | 'before-all' | 'after-all'): void {
    const fromStep = this.plan.steps[fromStepIndex]
    if (!fromStep || fromStep.kind !== 'JOURNEY') return
    const journeyIdx = fromStep.journeys.findIndex((j) => j.vehicleId === vehicleId)
    if (journeyIdx === -1) return
    const [intent] = fromStep.journeys.splice(journeyIdx, 1)

    if (toAfterStepIndex === 'before-all') {
      this.plan.steps.unshift({ kind: 'JOURNEY', journeys: [intent] })
    } else if (toAfterStepIndex === 'after-all') {
      this.plan.steps.push({ kind: 'JOURNEY', journeys: [intent] })
    } else {
      // Slot after toAfterStepIndex: first journey step at index > toAfterStepIndex
      let firstJourneyAfter = -1
      for (let i = toAfterStepIndex + 1; i < this.plan.steps.length; i++) {
        if (this.plan.steps[i].kind === 'JOURNEY') {
          firstJourneyAfter = i
          break
        }
      }
      const targetStep = firstJourneyAfter >= 0 ? this.plan.steps[firstJourneyAfter] : null
      const canAddToExisting =
        targetStep?.kind === 'JOURNEY' &&
        !targetStep.journeys.some((j: JourneyIntent) => j.vehicleId === vehicleId)
      if (canAddToExisting && targetStep.kind === 'JOURNEY') {
        targetStep.journeys.push(intent)
      } else {
        this.plan.steps.splice(toAfterStepIndex + 1, 0, { kind: 'JOURNEY', journeys: [intent] })
      }
    }

    this.pruneAndMerge()
  }

  /** Move a vehicle's journey intent into a specific journey step. If that step already has an intent for this vehicle, replace it. */
  moveJourneyIntentIntoStep(vehicleId: number, fromStepIndex: number, toStepIndex: number): void {
    const fromStep = this.plan.steps[fromStepIndex]
    const toStep = this.plan.steps[toStepIndex]
    if (!fromStep || fromStep.kind !== 'JOURNEY' || !toStep || toStep.kind !== 'JOURNEY') return
    const journeyIdx = fromStep.journeys.findIndex((j) => j.vehicleId === vehicleId)
    if (journeyIdx === -1) return
    const [intent] = fromStep.journeys.splice(journeyIdx, 1)
    const existingIdx = toStep.journeys.findIndex((j) => j.vehicleId === vehicleId)
    if (existingIdx >= 0) toStep.journeys.splice(existingIdx, 1)
    toStep.journeys.push(intent)
    this.pruneAndMerge()
  }

  /** Insert a new JourneyStep after the given index, containing only vehicleId → toTileId. */
  insertJourneyStepAfter(afterIndex: number, vehicleId: number, toTileId: number): void {
    const newStep: JourneyStep = { kind: 'JOURNEY', journeys: [{ vehicleId, toTileId }] }
    if (afterIndex < 0) {
      this.plan.steps.unshift(newStep)
    } else {
      this.plan.steps.splice(afterIndex + 1, 0, newStep)
    }
    this.pruneAndMerge()
  }

  /** Add vehicleId→toTileId after afterIndex, merging into the first existing journey step
   *  (after afterIndex) that doesn't already have this vehicle. Falls back to inserting a new
   *  step at afterIndex+1 if no suitable step exists. Returns the landing step index. */
  addOrMergeJourneyAfter(afterIndex: number, vehicleId: number, toTileId: number): number {
    // Advance past cargo steps for this vehicle, skipping unrelated journey steps,
    // until we hit a journey step that involves this vehicle (it moves to a new position).
    let effectiveAfter = afterIndex
    for (let i = afterIndex + 1; i < this.plan.steps.length; i++) {
      const step = this.plan.steps[i]
      if (step.kind === 'JOURNEY') {
        if (step.journeys.some((j) => j.vehicleId === vehicleId)) break
        continue
      }
      const a = step.action
      if ((a.kind === 'LOAD' || a.kind === 'UNLOAD' || a.kind === 'DELIVER') && a.vehicleId === vehicleId) {
        effectiveAfter = i
      }
    }
    // Try to merge into the first journey step after effectiveAfter that doesn't have this vehicle
    for (let i = effectiveAfter + 1; i < this.plan.steps.length; i++) {
      const step = this.plan.steps[i]
      if (step.kind === 'JOURNEY' && !step.journeys.some((j) => j.vehicleId === vehicleId)) {
        step.journeys.push({ vehicleId, toTileId })
        this.pruneAndMerge()
        return i
      }
      if (step.kind === 'JOURNEY') break
    }
    this.insertJourneyStepAfter(effectiveAfter, vehicleId, toTileId)
    return effectiveAfter + 1
  }

  /** Remove vehicleId's journey intent from the JourneyStep at stepIndex. */
  removeJourneyIntent(stepIndex: number, vehicleId: number): void {
    const step = this.plan.steps[stepIndex]
    if (!step || step.kind !== 'JOURNEY') return
    const idx = step.journeys.findIndex((j) => j.vehicleId === vehicleId)
    if (idx !== -1) step.journeys.splice(idx, 1)
    this.pruneAndMerge()
  }

  // ---------------------------------------------------------------------------
  // Cargo intents
  // ---------------------------------------------------------------------------

  /** Insert a single-intent CargoStep after the given step index. */
  insertCargoStepAfter(afterStepIndex: number, intent: CargoIntent): void {
    const newStep: CargoStep = { kind: 'CARGO', action: intent }
    if (afterStepIndex < 0) {
      this.plan.steps.unshift(newStep)
    } else {
      this.plan.steps.splice(afterStepIndex + 1, 0, newStep)
    }
    this.pruneAndMerge()
  }

  /** Remove the CargoStep at stepIndex (whole step). */
  removeCargoIntent(stepIndex: number): void {
    const step = this.plan.steps[stepIndex]
    if (!step || step.kind !== 'CARGO') return
    this.plan.steps.splice(stepIndex, 1)
    this.pruneAndMerge()
  }

  /** Move a CargoStep from fromStepIndex to after toAfterStepIndex. */
  moveCargoStep(fromStepIndex: number, toAfterStepIndex: number): void {
    const fromStep = this.plan.steps[fromStepIndex]
    if (!fromStep || fromStep.kind !== 'CARGO') return
    const [removed] = this.plan.steps.splice(fromStepIndex, 1)
    const insertAt = toAfterStepIndex >= fromStepIndex ? toAfterStepIndex : toAfterStepIndex + 1
    this.plan.steps.splice(insertAt, 0, removed)
    this.pruneAndMerge()
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  pruneAndMerge(): void {
    let changed = true
    while (changed) {
      changed = false
      for (let i = this.plan.steps.length - 1; i >= 0; i--) {
        const step = this.plan.steps[i]
        if (step.kind === 'JOURNEY' && step.journeys.length === 0) {
          this.plan.steps.splice(i, 1)
          changed = true
        }
      }
    }
  }
}

// Re-export PlanStep for consumers that only need the manager
export type { PlanStep }
