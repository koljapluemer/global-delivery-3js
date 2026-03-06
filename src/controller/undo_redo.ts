import type { Plan } from '../model/types/Plan'

export class UndoRedoHistory {
  private past: Plan[] = []
  private future: Plan[] = []

  /** Call BEFORE each mutation: deep-clones current plan into past stack, clears future. */
  snapshot(current: Plan): void {
    this.past.push(structuredClone(current))
    this.future = []
  }

  canUndo(): boolean { return this.past.length > 0 }
  canRedo(): boolean { return this.future.length > 0 }

  clear(): void {
    this.past = []
    this.future = []
  }

  /** Returns previous plan if available, null if at beginning. */
  undo(current: Plan): Plan | null {
    if (!this.past.length) return null
    this.future.push(structuredClone(current))
    return this.past.pop()!
  }

  /** Returns next plan if available, null if at end. */
  redo(current: Plan): Plan | null {
    if (!this.future.length) return null
    this.past.push(structuredClone(current))
    return this.future.pop()!
  }
}
