import { createElement, Trash2 } from 'lucide'
import type { Plan } from '../../../model/types/Plan'
import type { DerivedPlanState } from '../../../model/types/DerivedPlanState'
import type { TileCentersApi } from '../../../controller/layer_0/tile_centers_api'
import type { EntityTarget } from '../../../model/types/EntityTarget'
import type { InspectionContent, StepEntry } from './types'
import { inspectEntity } from './entity_inspector'

export class InspectorPanel {
  /** Called when the user clicks "Add Pin to Route" for a vehicle. */
  onAddPin: ((vehicleId: number) => void) | null = null
  /** Called when the user removes a journey intent from a step. */
  onRemoveJourneyIntent: ((stepIndex: number, vehicleId: number) => void) | null = null
  /** Called when the user removes a cargo intent from a step. */
  onRemoveCargoIntent: ((stepIndex: number) => void) | null = null
  /** Called when the user initiates an unload from a journey step. */
  onUnloadFromStep: ((vehicleId: number, stepIndex: number, crateId: number) => void) | null = null
  /** Called when the panel is closed via the close button. */
  onClose: (() => void) | null = null

  private aside: HTMLElement | null = null
  private body: HTMLElement | null = null
  private currentTarget: EntityTarget | null = null

  mount(container: HTMLElement): void {
    const aside = document.createElement('aside')
    Object.assign(aside.style, {
      position: 'fixed',
      right: '0',
      top: '48px',
      height: 'calc(100% - 48px)',
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

  show(target: EntityTarget, plan: Plan, derived: DerivedPlanState, tileApi: TileCentersApi): void {
    if (!this.aside || !this.body) return
    this.currentTarget = target
    this.body.innerHTML = ''
    if (target.kind === 'COUNTRY') {
      this.renderCountryContent(target.countryName, this.body)
    } else {
      const content = inspectEntity(target, plan, derived, tileApi)
      this.renderContent(content, target, this.body)
    }
    this.aside.style.display = 'block'
  }

  /** Re-render the panel for the currently-shown entity, if one is visible. */
  refresh(plan: Plan, derived: DerivedPlanState, tileApi: TileCentersApi): void {
    if (this.currentTarget) this.show(this.currentTarget, plan, derived, tileApi)
  }

  hide(): void {
    if (this.aside) this.aside.style.display = 'none'
    this.currentTarget = null
    this.onClose?.()
  }

  private renderCountryContent(countryName: string, container: HTMLElement): void {
    const heading = document.createElement('h2')
    heading.textContent = countryName
    container.appendChild(heading)

    const note = document.createElement('p')
    note.textContent = 'Destination country'
    Object.assign(note.style, { fontSize: '12px', color: '#aaa', margin: '0.25rem 0 0' })
    container.appendChild(note)
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
      addRow('Reward Money', `$${content.rewardMoney}`)
      addRow('Reward Stamps', `★${content.rewardStamps}`)
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
    Object.assign(ul.style, { listStyle: 'none', padding: '0', margin: '0' })

    for (const entry of entries) {
      const li = document.createElement('li')
      Object.assign(li.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
        padding: '0.3rem 0',
      })

      const topRow = document.createElement('div')
      Object.assign(topRow.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
      })

      const text = document.createElement('span')
      const b = document.createElement('b')
      b.textContent = entry.stepLabel + ' '
      text.appendChild(b)
      text.appendChild(document.createTextNode(entry.description))
      if (entry.kind === 'CARGO' && !entry.valid) {
        const warn = document.createElement('span')
        warn.textContent = ' ⚠'
        Object.assign(warn.style, { color: '#ff8888' })
        text.appendChild(warn)
      }

      const removeBtn = document.createElement('button')
      removeBtn.title = 'Remove step'
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
        if (entry.kind === 'JOURNEY') {
          this.onRemoveJourneyIntent?.(entry.stepIndex, entry.vehicleId)
        } else {
          this.onRemoveCargoIntent?.(entry.stepIndex)
        }
      })

      topRow.appendChild(text)
      topRow.appendChild(removeBtn)
      li.appendChild(topRow)

      if (entry.kind === 'JOURNEY' && entry.onBoard.length > 0) {
        const btnRow = document.createElement('div')
        Object.assign(btnRow.style, { display: 'flex', flexWrap: 'wrap', gap: '4px', paddingLeft: '8px' })
        for (const { crateId, label } of entry.onBoard) {
          const unloadBtn = document.createElement('button')
          unloadBtn.textContent = `Unload ${label} →`
          Object.assign(unloadBtn.style, {
            fontSize: '10px',
            padding: '2px 7px',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.25)',
            background: 'rgba(255,255,255,0.08)',
            color: '#fff',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          })
          unloadBtn.addEventListener('click', () => {
            this.onUnloadFromStep?.(entry.vehicleId, entry.stepIndex, crateId)
          })
          btnRow.appendChild(unloadBtn)
        }
        li.appendChild(btnRow)
      }

      ul.appendChild(li)
    }

    return ul
  }
}
