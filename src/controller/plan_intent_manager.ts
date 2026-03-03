import type { Plan, PlanStep, JourneyStep, CargoStep, CargoIntent } from '../model/types/Plan'

export class PlanIntentManager {
  private plan: Plan

  constructor(plan: Plan) { this.plan = plan }

  getPlan(): Plan { return this.plan }
  resetPlan(plan: Plan): void { this.plan = plan }

  // ---------------------------------------------------------------------------
  // Journey intents
  // ---------------------------------------------------------------------------

  /** Add/update journey intent for vehicleId in the earliest JourneyStep that has
   *  no intent for this vehicle, or append a new JourneyStep at the end.
   *  Returns the step index used. */
  addJourneyToEarliestStep(vehicleId: number, toTileId: number): number {
    for (let i = 0; i < this.plan.steps.length; i++) {
      const step = this.plan.steps[i]
      if (step.kind !== 'JOURNEY') continue
      if (!step.journeys.some((j) => j.vehicleId === vehicleId)) {
        step.journeys.push({ vehicleId, toTileId })
        this.pruneAndMerge()
        // Find the actual index after pruning (steps may have shifted)
        return this.plan.steps.findIndex(
          (s) => s.kind === 'JOURNEY' && s.journeys.some((j) => j.vehicleId === vehicleId && j.toTileId === toTileId),
        )
      }
    }
    // No suitable step found: append at end
    const newStep: JourneyStep = { kind: 'JOURNEY', journeys: [{ vehicleId, toTileId }] }
    this.plan.steps.push(newStep)
    this.pruneAndMerge()
    return this.plan.steps.length - 1
  }

  /** Update destination of an existing journey intent. */
  updateJourneyTarget(stepIndex: number, vehicleId: number, newTileId: number): void {
    const step = this.plan.steps[stepIndex]
    if (!step || step.kind !== 'JOURNEY') return
    const journey = step.journeys.find((j) => j.vehicleId === vehicleId)
    if (journey) journey.toTileId = newTileId
  }

  /** Move a vehicle's journey intent from one JourneyStep to another.
   *  If destination already has an intent for this vehicle, REPLACE (delete old). */
  moveJourneyIntent(vehicleId: number, fromStepIndex: number, toStepIndex: number | 'before-all' | 'after-all'): void {
    const fromStep = this.plan.steps[fromStepIndex]
    if (!fromStep || fromStep.kind !== 'JOURNEY') return
    const journeyIdx = fromStep.journeys.findIndex((j) => j.vehicleId === vehicleId)
    if (journeyIdx === -1) return
    const [intent] = fromStep.journeys.splice(journeyIdx, 1)

    if (toStepIndex === 'before-all') {
      this.plan.steps.unshift({ kind: 'JOURNEY', journeys: [intent] })
    } else if (toStepIndex === 'after-all') {
      this.plan.steps.push({ kind: 'JOURNEY', journeys: [intent] })
    } else {
      // toStepIndex may have shifted after splice; use it relative to original indices
      const targetStep = this.plan.steps[toStepIndex]
      if (targetStep && targetStep.kind === 'JOURNEY') {
        const existing = targetStep.journeys.findIndex((j) => j.vehicleId === vehicleId)
        if (existing !== -1) {
          targetStep.journeys[existing] = intent
        } else {
          targetStep.journeys.push(intent)
        }
      } else {
        // Insert a new JourneyStep at toStepIndex
        const newStep: JourneyStep = { kind: 'JOURNEY', journeys: [intent] }
        this.plan.steps.splice(toStepIndex, 0, newStep)
      }
    }

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

  /** Add a cargo intent to the CargoStep immediately following the JourneyStep at precedingJourneyStepIndex.
   *  Creates the CargoStep if needed. */
  addCargoIntentAfterJourneyStep(precedingJourneyStepIndex: number, intent: CargoIntent): void {
    const cargoStepIndex = this.ensureCargoStepAfter(precedingJourneyStepIndex)
    const cargoStep = this.plan.steps[cargoStepIndex] as CargoStep
    cargoStep.actions.push(intent)
  }

  /** Remove the cargo intent at actionIndex from CargoStep at stepIndex. */
  removeCargoIntent(stepIndex: number, actionIndex: number): void {
    const step = this.plan.steps[stepIndex]
    if (!step || step.kind !== 'CARGO') return
    step.actions.splice(actionIndex, 1)
    this.pruneAndMerge()
  }

  /** Move cargo intent (possibly between cargo steps). */
  moveCargoIntent(fromStepIndex: number, fromActionIndex: number, toStepIndex: number, toActionIndex: number): void {
    const fromStep = this.plan.steps[fromStepIndex]
    if (!fromStep || fromStep.kind !== 'CARGO') return
    const [intent] = fromStep.actions.splice(fromActionIndex, 1)

    let adjustedToActionIndex = toActionIndex
    if (fromStepIndex === toStepIndex && fromActionIndex < toActionIndex) {
      adjustedToActionIndex--
    }

    const toStep = this.plan.steps[toStepIndex]
    if (!toStep || toStep.kind !== 'CARGO') {
      // Can't move; put back
      fromStep.actions.splice(fromActionIndex, 0, intent)
      return
    }

    toStep.actions.splice(adjustedToActionIndex, 0, intent)
    this.pruneAndMerge()
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private pruneAndMerge(): void {
    let changed = true
    while (changed) {
      changed = false
      // 1. Remove empty JourneySteps
      for (let i = this.plan.steps.length - 1; i >= 0; i--) {
        const step = this.plan.steps[i]
        if (step.kind === 'JOURNEY' && step.journeys.length === 0) {
          this.plan.steps.splice(i, 1)
          changed = true
        }
      }
      // 2. Merge adjacent CargoSteps
      for (let i = 0; i < this.plan.steps.length - 1; i++) {
        if (this.plan.steps[i].kind === 'CARGO' && this.plan.steps[i + 1].kind === 'CARGO') {
          const merged: CargoStep = {
            kind: 'CARGO',
            actions: [
              ...(this.plan.steps[i] as CargoStep).actions,
              ...(this.plan.steps[i + 1] as CargoStep).actions,
            ],
          }
          this.plan.steps.splice(i, 2, merged)
          changed = true
          break
        }
      }
    }
  }

  private ensureCargoStepAfter(stepIndex: number): number {
    if (this.plan.steps[stepIndex + 1]?.kind === 'CARGO') {
      return stepIndex + 1
    }
    const newCargoStep: CargoStep = { kind: 'CARGO', actions: [] }
    this.plan.steps.splice(stepIndex + 1, 0, newCargoStep)
    return stepIndex + 1
  }
}

// Re-export PlanStep for consumers that only need the manager
export type { PlanStep }
