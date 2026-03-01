import type { Plan } from '../../../model/types/Plan'
import type { TileCentersApi } from '../../../controller/layer_0/tile_centers_api'
import type { EntityTarget } from '../../../model/types/EntityTarget'
import type { InspectionContent, StepEntry } from './types'
import { inspectEntity } from './entity_inspector'

export class InspectorPanel {
  /** Called when the user clicks "Add Pin to Route" for a vehicle. */
  onAddPin: ((vehicleId: number) => void) | null = null

  private aside: HTMLElement | null = null
  private body: HTMLElement | null = null

  mount(container: HTMLElement): void {
    const aside = document.createElement('aside')
    Object.assign(aside.style, {
      position: 'fixed',
      right: '0',
      top: '0',
      height: '100%',
      overflowY: 'auto',
      padding: '1rem',
      background: 'rgba(0,0,0,0.6)',
      color: '#fff',
      zIndex: '10',
      minWidth: '220px',
      display: 'none',
    })

    const closeBtn = document.createElement('button')
    closeBtn.textContent = '✕'
    closeBtn.addEventListener('click', () => { this.hide() })
    aside.appendChild(closeBtn)

    const body = document.createElement('div')
    aside.appendChild(body)

    this.aside = aside
    this.body = body
    container.appendChild(aside)
  }

  show(target: EntityTarget, plan: Plan, tileApi: TileCentersApi): void {
    if (!this.aside || !this.body) return
    const content = inspectEntity(target, plan, tileApi)
    this.body.innerHTML = ''
    this.renderContent(content, target, this.body)
    this.aside.style.display = 'block'
  }

  hide(): void {
    if (this.aside) this.aside.style.display = 'none'
  }

  private renderContent(content: InspectionContent, target: EntityTarget, container: HTMLElement): void {
    const heading = document.createElement('h2')
    heading.textContent = content.kind === 'VEHICLE'
      ? content.name
      : `Crate → ${content.destinationCountry}`
    container.appendChild(heading)

    const dl = document.createElement('dl')

    const addRow = (term: string, detail: string) => {
      const dt = document.createElement('dt')
      dt.textContent = term
      const dd = document.createElement('dd')
      dd.textContent = detail
      dl.appendChild(dt)
      dl.appendChild(dd)
    }

    if (content.kind === 'VEHICLE') {
      addRow('Location', content.location ?? 'open sea')
    } else {
      addRow('Destination', content.destinationCountry)
      const locText = content.locationNote ?? content.location ?? 'open sea'
      addRow('Location', locText)
    }

    container.appendChild(dl)

    if (content.stepEntries.length > 0) {
      container.appendChild(this.buildStepList(content.stepEntries))
    }

    if (content.kind === 'VEHICLE') {
      const btn = document.createElement('button')
      btn.textContent = 'Add Pin to Route'
      Object.assign(btn.style, { marginTop: '0.75rem', display: 'block' })
      btn.addEventListener('click', () => {
        if (target.kind === 'VEHICLE') this.onAddPin?.(target.id)
      })
      container.appendChild(btn)
    }
  }

  private buildStepList(entries: readonly StepEntry[]): HTMLElement {
    const ul = document.createElement('ul')
    for (const entry of entries) {
      const li = document.createElement('li')
      const b = document.createElement('b')
      b.textContent = entry.stepLabel + ' '
      li.appendChild(b)
      li.appendChild(document.createTextNode(entry.description))
      ul.appendChild(li)
    }
    return ul
  }
}
