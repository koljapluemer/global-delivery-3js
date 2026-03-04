import { createElement, Trash2 } from 'lucide'
import type { Plan, CargoIntent } from '../../../model/types/Plan'
import type { DerivedPlanState, DerivedJourneyStep, DerivedCargoStep, DerivedCargoAction } from '../../../model/types/DerivedPlanState'
import type { TileCentersApi } from '../../../controller/layer_0/tile_centers_api'

export class PlanPanel {
  onRemoveJourneyIntent: ((stepIndex: number, vehicleId: number) => void) | null = null
  onRemoveCargoIntent: ((stepIndex: number) => void) | null = null
  onMoveJourneyIntent: ((vehicleId: number, fromStepIndex: number, toStepIndex: number | 'before-all' | 'after-all') => void) | null = null
  onMoveCargoStep: ((fromStepIndex: number, toAfterStepIndex: number) => void) | null = null

  private aside: HTMLElement | null = null
  private tileApi: TileCentersApi | null = null

  mount(container: HTMLElement, tileApi: TileCentersApi): void {
    const aside = document.createElement('aside')
    Object.assign(aside.style, {
      position: 'fixed',
      left: '0',
      top: '48px',
      height: 'calc(100% - 48px)',
      overflowY: 'auto',
      padding: '1rem',
      background: 'rgba(0,0,0,0.6)',
      color: '#fff',
      zIndex: '10',
      minWidth: '220px',
      maxWidth: '300px',
    })
    this.aside = aside
    this.tileApi = tileApi
    container.appendChild(aside)
  }

  update(plan: Plan, derived: DerivedPlanState): void {
    if (!this.aside || !this.tileApi) return
    this.aside.innerHTML = ''

    if (derived.steps.length === 0) {
      const empty = document.createElement('p')
      empty.textContent = 'No steps yet. Click a vehicle to add waypoints.'
      Object.assign(empty.style, { fontSize: '12px', opacity: '0.6', margin: '0' })
      this.aside.appendChild(empty)
      return
    }

    // Before-all journey drop zone
    this.aside.appendChild(this.createJourneyDropZone('before-all'))

    for (const step of derived.steps) {
      if (step.kind === 'JOURNEY') {
        this.aside.appendChild(this.buildJourneySection(step as DerivedJourneyStep, plan))
      } else {
        const cargoStep = step as DerivedCargoStep
        this.aside.appendChild(this.buildCargoSection(cargoStep, plan))
      }
    }

    // After-all journey drop zone
    this.aside.appendChild(this.createJourneyDropZone('after-all'))
  }

  // ---------------------------------------------------------------------------
  // Private — section builders
  // ---------------------------------------------------------------------------

  private buildJourneySection(step: DerivedJourneyStep, plan: Plan): HTMLElement {
    const section = document.createElement('section')
    Object.assign(section.style, { marginBottom: '0.75rem' })

    const heading = document.createElement('h2')
    Object.assign(heading.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      margin: '0 0 0.4rem',
      fontSize: '13px',
      fontWeight: 'bold',
    })

    const labelSpan = document.createElement('span')
    labelSpan.textContent = `Journey #${step.stepIndex}`
    heading.appendChild(labelSpan)

    if (step.stepTraveltime > 0) {
      const ttSpan = document.createElement('span')
      ttSpan.textContent = `⏱ ${step.stepTraveltime}`
      Object.assign(ttSpan.style, { fontSize: '11px', fontWeight: 'normal', opacity: '0.75' })
      heading.appendChild(ttSpan)
    }

    section.appendChild(heading)

    const journeysDiv = document.createElement('div')
    Object.assign(journeysDiv.style, { display: 'flex', flexDirection: 'row', gap: '4px', flexWrap: 'wrap' })

    for (const j of step.journeys) {
      const vehicle = plan.vehicles[j.vehicleId]
      const tile = this.tileApi!.getTileById(j.toTileId)
      const destText = tile?.country_name ?? 'open sea'

      const card = document.createElement('div')
      Object.assign(card.style, {
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '6px',
        padding: '6px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '6px',
        cursor: 'grab',
        minHeight: `${Math.max(28, j.traveltime)}px`,
      })
      card.draggable = true
      card.dataset.stepIndex = String(step.stepIndex)
      card.dataset.vehicleId = String(j.vehicleId)

      const text = document.createElement('span')
      text.textContent = `${vehicle?.name ?? '?'} → ${destText}`
      Object.assign(text.style, { fontSize: '12px', flex: '1' })

      const removeBtn = document.createElement('button')
      removeBtn.title = 'Remove journey'
      Object.assign(removeBtn.style, {
        flex: '0 0 auto',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px',
        color: '#ff6b6b',
        lineHeight: '0',
      })
      removeBtn.appendChild(createElement(Trash2, { width: 12, height: 12 }))
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.onRemoveJourneyIntent?.(step.stepIndex, j.vehicleId)
      })

      card.addEventListener('dragstart', (e) => {
        if (!e.dataTransfer) return
        e.dataTransfer.setData('application/journey-intent', JSON.stringify({
          vehicleId: j.vehicleId,
          fromStepIndex: step.stepIndex,
        }))
        e.dataTransfer.effectAllowed = 'move'
      })

      card.appendChild(text)
      card.appendChild(removeBtn)
      journeysDiv.appendChild(card)
    }

    section.appendChild(journeysDiv)

    // Drop target for journey intents after this step
    section.appendChild(this.createJourneyDropZone(step.stepIndex))

    return section
  }

  private buildCargoSection(step: DerivedCargoStep, plan: Plan): HTMLElement {
    const section = document.createElement('section')
    Object.assign(section.style, {
      marginBottom: '0.75rem',
      borderLeft: '2px solid rgba(255,255,255,0.15)',
      paddingLeft: '8px',
    })

    section.appendChild(this.createCargoDropZone(step.stepIndex - 1))
    section.appendChild(this.buildCargoCard(step.action, step.stepIndex, plan))
    section.appendChild(this.createCargoDropZone(step.stepIndex))

    return section
  }

  private buildCargoCard(action: DerivedCargoAction, stepIndex: number, plan: Plan): HTMLElement {
    const card = document.createElement('div')
    Object.assign(card.style, {
      background: action.valid ? 'rgba(255,255,255,0.07)' : 'rgba(255,80,80,0.15)',
      borderRadius: '6px',
      padding: '5px 8px',
      marginBottom: '3px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '6px',
      cursor: 'grab',
      border: action.valid ? 'none' : '1px solid rgba(255,80,80,0.4)',
    })
    card.draggable = true
    card.dataset.stepIndex = String(stepIndex)

    const text = document.createElement('span')
    text.textContent = this.describeCargoIntent(action.intent, plan)
    Object.assign(text.style, { fontSize: '11px', flex: '1' })

    if (!action.valid && action.invalidReason) {
      const warn = document.createElement('span')
      warn.textContent = '⚠'
      warn.title = action.invalidReason
      Object.assign(warn.style, { color: '#ff8888', marginRight: '4px' })
      card.appendChild(warn)
    }

    card.appendChild(text)

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
    removeBtn.appendChild(createElement(Trash2, { width: 12, height: 12 }))
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.onRemoveCargoIntent?.(stepIndex)
    })
    card.appendChild(removeBtn)

    card.addEventListener('dragstart', (e) => {
      if (!e.dataTransfer) return
      e.dataTransfer.setData('application/cargo-intent', JSON.stringify({ fromStepIndex: stepIndex }))
      e.dataTransfer.effectAllowed = 'move'
    })

    return card
  }

  private createJourneyDropZone(afterStepIndex: number | 'before-all' | 'after-all'): HTMLElement {
    const zone = document.createElement('div')
    Object.assign(zone.style, {
      height: '20px',
      borderRadius: '4px',
      margin: '4px 0',
      border: '1px dashed rgba(255,255,255,0.18)',
      transition: 'background 0.15s, border-color 0.15s',
    })

    zone.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('application/journey-intent')) return
      e.preventDefault()
      zone.style.background = 'rgba(255,255,255,0.22)'
      zone.style.borderColor = 'rgba(255,255,255,0.5)'
    })
    zone.addEventListener('dragleave', () => {
      zone.style.background = ''
      zone.style.borderColor = 'rgba(255,255,255,0.18)'
    })
    zone.addEventListener('drop', (e) => {
      zone.style.background = ''
      zone.style.borderColor = 'rgba(255,255,255,0.18)'
      if (!e.dataTransfer) return
      const raw = e.dataTransfer.getData('application/journey-intent')
      if (!raw) return
      const { vehicleId, fromStepIndex } = JSON.parse(raw) as { vehicleId: number; fromStepIndex: number }
      if (afterStepIndex === 'before-all') {
        this.onMoveJourneyIntent?.(vehicleId, fromStepIndex, 'before-all')
      } else if (afterStepIndex === 'after-all') {
        this.onMoveJourneyIntent?.(vehicleId, fromStepIndex, 'after-all')
      } else {
        this.onMoveJourneyIntent?.(vehicleId, fromStepIndex, afterStepIndex)
      }
    })

    return zone
  }

  private createCargoDropZone(toAfterStepIndex: number): HTMLElement {
    const zone = document.createElement('div')
    Object.assign(zone.style, {
      height: '12px',
      borderRadius: '4px',
      margin: '2px 0',
      border: '1px dashed rgba(255,255,255,0.12)',
      transition: 'background 0.15s, border-color 0.15s',
    })

    zone.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('application/cargo-intent')) return
      e.preventDefault()
      zone.style.background = 'rgba(255,255,255,0.2)'
      zone.style.borderColor = 'rgba(255,255,255,0.45)'
    })
    zone.addEventListener('dragleave', () => {
      zone.style.background = ''
      zone.style.borderColor = 'rgba(255,255,255,0.12)'
    })
    zone.addEventListener('drop', (e) => {
      zone.style.background = ''
      zone.style.borderColor = 'rgba(255,255,255,0.12)'
      if (!e.dataTransfer) return
      const raw = e.dataTransfer.getData('application/cargo-intent')
      if (!raw) return
      const { fromStepIndex } = JSON.parse(raw) as { fromStepIndex: number }
      this.onMoveCargoStep?.(fromStepIndex, toAfterStepIndex)
    })

    return zone
  }

  private describeCargoIntent(intent: CargoIntent, plan: Plan): string {
    const vehicleName = (id: number) => plan.vehicles[id]?.name ?? `Vehicle ${id}`
    const crateDest = (id: number) => plan.crates[id]?.destinationCountry ?? `Crate ${id}`
    const tileName = (tileId: number) => this.tileApi!.getTileById(tileId)?.country_name ?? 'open sea'

    switch (intent.kind) {
      case 'LOAD':
        return `${vehicleName(intent.vehicleId)} loads Crate→${crateDest(intent.crateId)}`
      case 'UNLOAD':
        return `${vehicleName(intent.vehicleId)} unloads Crate→${crateDest(intent.crateId)} to ${tileName(intent.toTileId)}`
      case 'TRANSFER':
        return `${vehicleName(intent.fromVehicleId)} transfers Crate→${crateDest(intent.crateId)} to ${vehicleName(intent.toVehicleId)}`
      case 'DELIVER':
        return `${vehicleName(intent.vehicleId)} delivers Crate→${crateDest(intent.crateId)}`
    }
  }
}
