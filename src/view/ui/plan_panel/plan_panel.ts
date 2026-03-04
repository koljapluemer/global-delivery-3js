import { createElement, Trash2 } from 'lucide'
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import type { Plan, CargoIntent } from '../../../model/types/Plan'
import type { DerivedPlanState, DerivedJourneyStep, DerivedCargoStep, DerivedCargoAction } from '../../../model/types/DerivedPlanState'
import type { TileCentersApi } from '../../../controller/layer_0/tile_centers_api'

const DROP_ZONE_STYLE: Record<string, string> = {
  minHeight: '24px',
  borderRadius: '6px',
  margin: '4px 0',
  border: '1px dashed rgba(255,255,255,0.35)',
  transition: 'background 0.15s, border-color 0.15s',
  boxSizing: 'border-box',
}

export class PlanPanel {
  onRemoveJourneyIntent: ((stepIndex: number, vehicleId: number) => void) | null = null
  onRemoveCargoIntent: ((stepIndex: number) => void) | null = null
  onMoveJourneyIntent: ((vehicleId: number, fromStepIndex: number, toStepIndex: number | 'before-all' | 'after-all') => void) | null = null
  onMoveJourneyIntentIntoStep: ((vehicleId: number, fromStepIndex: number, toStepIndex: number) => void) | null = null
  onMoveCargoStep: ((fromStepIndex: number, toAfterStepIndex: number) => void) | null = null

  private aside: HTMLElement | null = null
  private tileApi: TileCentersApi | null = null
  private draggableCleanups: Array<() => void> = []
  private dropTargetCleanups: Array<() => void> = []
  private monitorCleanup: (() => void) | null = null
  private currentPlan: Plan | null = null
  private currentDerived: DerivedPlanState | null = null

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

    this.monitorCleanup = monitorForElements({
      onDragStart: ({ source }) => {
        const data = source.data as { type: string; vehicleId?: number; fromStepIndex?: number }
        if (data.type === 'journey' && data.vehicleId !== undefined && data.fromStepIndex !== undefined) {
          this.showDropTargets('journey', data.vehicleId, data.fromStepIndex)
        } else if (data.type === 'cargo' && data.fromStepIndex !== undefined) {
          this.showDropTargets('cargo', undefined, data.fromStepIndex)
        }
      },
      onDrop: () => this.hideDropTargets(),
    })
  }

  unmount(): void {
    this.hideDropTargets()
    this.monitorCleanup?.()
    this.monitorCleanup = null
    this.aside = null
    this.tileApi = null
  }

  update(plan: Plan, derived: DerivedPlanState): void {
    if (!this.aside || !this.tileApi) return
    this.currentPlan = plan
    this.currentDerived = derived

    for (const c of this.draggableCleanups) c()
    this.draggableCleanups = []

    this.aside.innerHTML = ''

    if (derived.steps.length === 0) {
      const empty = document.createElement('p')
      empty.textContent = 'No steps yet. Click a vehicle to add waypoints.'
      Object.assign(empty.style, { fontSize: '12px', opacity: '0.6', margin: '0' })
      this.aside.appendChild(empty)
      return
    }

    for (const step of derived.steps) {
      if (step.kind === 'JOURNEY') {
        this.aside.appendChild(this.buildJourneySection(step as DerivedJourneyStep, plan))
      } else {
        const cargoStep = step as DerivedCargoStep
        this.aside.appendChild(this.buildCargoSection(cargoStep, plan))
      }
    }

    this.registerDraggables()
  }

  private registerDraggables(): void {
    if (!this.aside || !this.currentPlan || !this.currentDerived) return
    const journeyCards = this.aside.querySelectorAll<HTMLElement>('[data-draggable="journey"]')
    const cargoCards = this.aside.querySelectorAll<HTMLElement>('[data-draggable="cargo"]')
    journeyCards.forEach((el) => {
      const vehicleId = Number(el.dataset.vehicleId)
      const fromStepIndex = Number(el.dataset.stepIndex)
      const cleanup = draggable({
        element: el,
        getInitialData: () => ({ type: 'journey', vehicleId, fromStepIndex }),
      })
      this.draggableCleanups.push(cleanup)
    })
    cargoCards.forEach((el) => {
      const fromStepIndex = Number(el.dataset.stepIndex)
      const cleanup = draggable({
        element: el,
        getInitialData: () => ({ type: 'cargo', fromStepIndex }),
      })
      this.draggableCleanups.push(cleanup)
    })
  }

  private showDropTargets(
    dragType: 'journey' | 'cargo',
    vehicleId?: number,
    _fromStepIndex?: number,
  ): void {
    if (!this.aside || !this.currentPlan || !this.currentDerived) return
    const sections = this.aside.querySelectorAll<HTMLElement>('[data-step-index]')
    const steps = this.currentDerived.steps
    const cleanups: Array<() => void> = []

    const createGhostZone = (
      afterStepIndex: number | 'before-all' | 'after-all',
    ): HTMLElement => {
      const zone = document.createElement('div')
      Object.assign(zone.style, DROP_ZONE_STYLE)
      zone.className = 'plan-panel-drop-zone'
      zone.dataset.ghost = '1'
      zone.dataset.afterStepIndex =
        afterStepIndex === 'before-all'
          ? 'before'
          : afterStepIndex === 'after-all'
            ? 'after'
            : String(afterStepIndex)

      const cleanup = dropTargetForElements({
        element: zone,
        getData: () => ({ type: 'ghost', afterStepIndex }),
        canDrop: ({ source }) => {
          const d = source.data as { type: string }
          if (dragType === 'journey') return d.type === 'journey'
          return d.type === 'cargo'
        },
        onDrop: ({ source }) => {
          const d = source.data as { type: string; vehicleId?: number; fromStepIndex?: number }
          if (d.type === 'journey' && d.vehicleId !== undefined && d.fromStepIndex !== undefined) {
            if (afterStepIndex === 'before-all') {
              this.onMoveJourneyIntent?.(d.vehicleId, d.fromStepIndex, 'before-all')
            } else if (afterStepIndex === 'after-all') {
              this.onMoveJourneyIntent?.(d.vehicleId, d.fromStepIndex, 'after-all')
            } else {
              this.onMoveJourneyIntent?.(d.vehicleId, d.fromStepIndex, afterStepIndex)
            }
          } else if (d.type === 'cargo' && d.fromStepIndex !== undefined) {
            const toAfter =
              afterStepIndex === 'before-all'
                ? -1
                : afterStepIndex === 'after-all'
                  ? steps.length - 1
                  : afterStepIndex
            this.onMoveCargoStep?.(d.fromStepIndex, toAfter)
          }
        },
      })
      cleanups.push(cleanup)
      return zone
    }

    for (let i = 0; i <= sections.length; i++) {
      const after: number | 'before-all' | 'after-all' =
        i === 0 ? 'before-all' : i === sections.length ? 'after-all' : i - 1
      const zone = createGhostZone(after)
      if (i < sections.length) {
        this.aside.insertBefore(zone, sections[i])
      } else {
        this.aside.appendChild(zone)
      }
    }

    if (dragType === 'journey' && vehicleId !== undefined) {
      const journeyCards = this.aside.querySelectorAll<HTMLElement>('[data-draggable="journey"]')
      journeyCards.forEach((card) => {
        const cardStepIndex = Number(card.dataset.stepIndex)
        const cardVehicleId = Number(card.dataset.vehicleId)
        const isReplace = cardVehicleId === vehicleId
        const cleanup = dropTargetForElements({
          element: card,
          getData: () => ({ type: 'in-step', stepIndex: cardStepIndex }),
          canDrop: ({ source }) => {
            const d = source.data as { type: string; vehicleId?: number }
            return d.type === 'journey' && d.vehicleId === vehicleId
          },
          onDropTargetChange: ({ location, self }) => {
            if (isReplace) {
              const isOver = location.current.dropTargets.some((dt) => dt.element === self.element)
              card.style.background = isOver ? 'rgba(255,80,80,0.35)' : 'rgba(255,255,255,0.08)'
              card.style.border = isOver ? '1px dashed rgba(255,255,255,0.6)' : 'none'
            }
          },
          onDrop: ({ source }) => {
            const d = source.data as { vehicleId?: number; fromStepIndex?: number }
            if (d.vehicleId !== undefined && d.fromStepIndex !== undefined) {
              this.onMoveJourneyIntentIntoStep?.(d.vehicleId, d.fromStepIndex, cardStepIndex)
            }
            card.style.background = ''
            card.style.border = ''
          },
        })
        cleanups.push(cleanup)
      })
    }

    this.dropTargetCleanups = cleanups
    this.aside.classList.add('plan-panel-dragging')
  }

  private hideDropTargets(): void {
    for (const c of this.dropTargetCleanups) c()
    this.dropTargetCleanups = []
    const zones = this.aside?.querySelectorAll('.plan-panel-drop-zone')
    zones?.forEach((z) => z.remove())
    this.aside?.classList.remove('plan-panel-dragging')
    const journeyCards = this.aside?.querySelectorAll<HTMLElement>('[data-draggable="journey"]')
    journeyCards?.forEach((card) => {
      card.style.background = ''
      card.style.border = ''
    })
  }

  private buildJourneySection(step: DerivedJourneyStep, plan: Plan): HTMLElement {
    const section = document.createElement('section')
    section.dataset.stepIndex = String(step.stepIndex)
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
      card.dataset.draggable = 'journey'
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

      card.appendChild(text)
      card.appendChild(removeBtn)
      journeysDiv.appendChild(card)
    }

    section.appendChild(journeysDiv)
    return section
  }

  private buildCargoSection(step: DerivedCargoStep, plan: Plan): HTMLElement {
    const section = document.createElement('section')
    section.dataset.stepIndex = String(step.stepIndex)
    Object.assign(section.style, {
      marginBottom: '0.75rem',
      borderLeft: '2px solid rgba(255,255,255,0.15)',
      paddingLeft: '8px',
    })

    section.appendChild(this.buildCargoCard(step.action, step.stepIndex, plan))
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
    card.dataset.draggable = 'cargo'
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

    return card
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
      case 'DELIVER':
        return `${vehicleName(intent.vehicleId)} delivers Crate→${crateDest(intent.crateId)}`
    }
  }
}
