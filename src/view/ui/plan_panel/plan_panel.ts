import type { Plan } from '../../../model/types/Plan'
import type { TileCentersApi } from '../../../controller/layer_0/tile_centers_api'
import type { PlanEvent, StepSummary } from './types'
import { derivePlanSummary } from './plan_event_deriver'

export class PlanPanel {
  private readonly plan: Plan
  private readonly tileApi: TileCentersApi

  constructor(plan: Plan, tileApi: TileCentersApi) {
    this.plan = plan
    this.tileApi = tileApi
  }

  mount(container: HTMLElement): void {
    const summaries = derivePlanSummary(this.plan, this.tileApi)
    container.appendChild(this.buildPanel(summaries))
  }

  private buildPanel(summaries: readonly StepSummary[]): HTMLElement {
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

    for (const summary of summaries) {
      aside.appendChild(this.buildStepSection(summary))
    }

    return aside
  }

  private buildStepSection(summary: StepSummary): HTMLElement {
    const section = document.createElement('section')

    const heading = document.createElement('h2')
    heading.textContent = summary.label
    section.appendChild(heading)

    if (summary.events.length > 0) {
      const ul = document.createElement('ul')
      for (const event of summary.events) {
        const li = document.createElement('li')
        li.textContent = this.eventToText(event)
        ul.appendChild(li)
      }
      section.appendChild(ul)
    }

    return section
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
}
