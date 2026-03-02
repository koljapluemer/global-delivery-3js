import { createElement, Trash2 } from 'lucide'
import type { Plan } from '../../../model/types/Plan'
import type { TileCentersApi } from '../../../controller/layer_0/tile_centers_api'
import type { StepAction } from '../../../model/types/StepAction'
import type { PlanEvent, StepSummary } from './types'
import { derivePlanSummary } from './plan_event_deriver'

export class PlanPanel {
  /** Called when the user removes an individual action from a step. */
  onRemoveAction: ((stepIndex: number, action: StepAction) => void) | null = null

  private readonly plan: Plan
  private readonly tileApi: TileCentersApi
  private aside: HTMLElement | null = null

  constructor(plan: Plan, tileApi: TileCentersApi) {
    this.plan = plan
    this.tileApi = tileApi
  }

  mount(container: HTMLElement): void {
    const aside = document.createElement('aside')
    Object.assign(aside.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      height: '100%',
      overflowY: 'auto',
      padding: '1rem',
      background: 'rgba(0,0,0,0.6)',
      color: '#fff',
      zIndex: '10',
    })
    this.aside = aside
    container.appendChild(aside)
    this.rebuild()
  }

  /** Re-derive plan summary and repopulate the panel. */
  update(): void { this.rebuild() }

  private rebuild(): void {
    if (!this.aside) return
    this.aside.innerHTML = ''
    const summaries = derivePlanSummary(this.plan, this.tileApi)
    for (const summary of summaries) {
      this.aside.appendChild(this.buildStepSection(summary))
    }
  }

  private buildStepSection(summary: StepSummary): HTMLElement {
    const section = document.createElement('section')
    Object.assign(section.style, { marginBottom: '0.75rem' })

    const heading = document.createElement('h2')
    heading.textContent = summary.label
    section.appendChild(heading)

    if (summary.events.length > 0) {
      const ul = document.createElement('ul')
      Object.assign(ul.style, { listStyle: 'none', margin: '0.25rem 0 0', padding: '0' })
      for (const event of summary.events) {
        ul.appendChild(this.buildEventRow(event))
      }
      section.appendChild(ul)
    }

    return section
  }

  private buildEventRow(event: PlanEvent): HTMLElement {
    const li = document.createElement('li')
    Object.assign(li.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.4rem',
      padding: '0.15rem 0',
    })

    const text = document.createElement('span')
    text.textContent = this.eventToText(event)

    const removeBtn = document.createElement('button')
    removeBtn.title = 'Remove action'
    Object.assign(removeBtn.style, {
      flex: '0 0 auto',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '2px',
      color: '#ff6b6b',
      lineHeight: '0',
    })
    removeBtn.appendChild(createElement(Trash2, { width: 13, height: 13 }))
    removeBtn.addEventListener('click', () => {
      this.onRemoveAction?.(event.stepIndex, this.eventToAction(event))
    })

    li.appendChild(text)
    li.appendChild(removeBtn)
    return li
  }

  private eventToText(event: PlanEvent): string {
    const loc = (country: string | null): string => country ?? 'open sea'
    switch (event.kind) {
      case 'VEHICLE_MOVED':
        return `${event.vehicleName} arrives in ${loc(event.toCountry)}`
      case 'CRATE_LOADED':
        return `Crate → ${event.crateDestination} loaded onto ${event.vehicleName}`
      case 'CRATE_UNLOADED':
        return `${event.vehicleName} unloads Crate → ${event.crateDestination} in ${loc(event.inCountry)}`
    }
  }

  private eventToAction(event: PlanEvent): StepAction {
    switch (event.kind) {
      case 'VEHICLE_MOVED': return { kind: 'VEHICLE_MOVED', vehicleId: event.vehicleId }
      case 'CRATE_LOADED':  return { kind: 'CRATE_LOADED',  crateId: event.crateId }
      case 'CRATE_UNLOADED': return { kind: 'CRATE_UNLOADED', crateId: event.crateId }
    }
  }
}
