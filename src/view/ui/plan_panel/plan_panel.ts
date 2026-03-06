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

const DROP_ZONE_HIDDEN = { display: 'none' as const }

/** Single source of truth for journey card normal state. */
const JOURNEY_CARD_DEFAULT_STYLE: Record<string, string> = {
  background: 'rgba(255,255,255,0.08)',
  border: 'none',
}

export class PlanPanel {
  onRemoveJourneyIntent: ((stepIndex: number, vehicleId: number) => void) | null = null
  onRemoveCargoIntent: ((stepIndex: number) => void) | null = null
  onMoveJourneyIntent: ((vehicleId: number, fromStepIndex: number, toStepIndex: number | 'before-all' | 'after-all') => void) | null = null
  onMoveJourneyIntentIntoStep: ((vehicleId: number, fromStepIndex: number, toStepIndex: number) => void) | null = null
  onMoveCargoStep: ((fromStepIndex: number, toAfterStepIndex: number) => void) | null = null
  onConfirmPlan: (() => void) | null = null

  private containerEl: HTMLElement | null = null
  private aside: HTMLElement | null = null
  private confirmBtn: HTMLButtonElement | null = null
  private tileApi: TileCentersApi | null = null
  private draggableCleanups: Array<() => void> = []
  private dropTargetCleanups: Array<() => void> = []
  private monitorCleanup: (() => void) | null = null
  private currentPlan: Plan | null = null
  private currentDerived: DerivedPlanState | null = null
  /** True while a drag is in progress; prevents update() from replacing DOM and detaching drop targets. */
  private isDragging = false

  mount(container: HTMLElement, tileApi: TileCentersApi): void {
    const aside = document.createElement('aside')
    Object.assign(aside.style, {
      position: 'fixed',
      left: '0',
      top: '48px',
      height: 'calc(100% - 48px)',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(0,0,0,0.6)',
      color: '#fff',
      zIndex: '10',
      minWidth: '220px',
      maxWidth: '300px',
      overflow: 'hidden',
    })

    const content = document.createElement('div')
    Object.assign(content.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '1rem',
    })
    aside.appendChild(content)

    const footer = document.createElement('div')
    Object.assign(footer.style, {
      padding: '0.5rem 1rem 0.75rem',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(0,0,0,0.6)',
    })
    const confirmBtn = document.createElement('button')
    Object.assign(confirmBtn.style, {
      width: '100%',
      padding: '0.5rem',
      fontSize: '13px',
      fontWeight: '600',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.25)',
      cursor: 'pointer',
      letterSpacing: '0.03em',
      background: 'rgba(255,255,255,0.12)',
      color: '#fff',
    })
    confirmBtn.textContent = 'Confirm Plan'
    confirmBtn.addEventListener('click', () => { if (!confirmBtn.disabled) this.onConfirmPlan?.() })
    confirmBtn.addEventListener('mouseenter', () => {
      if (!confirmBtn.disabled) confirmBtn.style.background = 'rgba(255,255,255,0.22)'
    })
    confirmBtn.addEventListener('mouseleave', () => {
      if (!confirmBtn.disabled) confirmBtn.style.background = 'rgba(255,255,255,0.12)'
    })
    footer.appendChild(confirmBtn)
    aside.appendChild(footer)

    this.containerEl = aside
    this.aside = content
    this.confirmBtn = confirmBtn
    this.tileApi = tileApi
    container.appendChild(aside)

    this.monitorCleanup = monitorForElements({
      onDragStart: ({ source }) => {
        this.isDragging = true
        const data = source.data as { type: string; vehicleId?: number; fromStepIndex?: number }
        if (data.type === 'journey' && data.vehicleId !== undefined && data.fromStepIndex !== undefined) {
          this.showDropTargets('journey')
        } else if (data.type === 'cargo' && data.fromStepIndex !== undefined) {
          this.showDropTargets('cargo')
        }
      },
      onDrop: () => {
        this.isDragging = false
        this.hideDropTargets()
      },
    })
  }

  unmount(): void {
    this.hideDropTargets()
    this.monitorCleanup?.()
    this.monitorCleanup = null
    this.containerEl = null
    this.aside = null
    this.confirmBtn = null
    this.tileApi = null
  }

  hide(): void {
    if (this.containerEl) this.containerEl.style.display = 'none'
  }

  show(): void {
    if (this.containerEl) this.containerEl.style.display = 'flex'
  }

  update(plan: Plan, derived: DerivedPlanState, canConfirm: boolean): void {
    if (!this.aside || !this.tileApi) return
    if (this.isDragging) return
    this.currentPlan = plan
    this.currentDerived = derived

    for (const c of this.draggableCleanups) c()
    this.draggableCleanups = []
    for (const c of this.dropTargetCleanups) c()
    this.dropTargetCleanups = []

    this.aside.innerHTML = ''

    if (this.confirmBtn) {
      this.confirmBtn.disabled = !canConfirm
      Object.assign(this.confirmBtn.style, {
        background: canConfirm ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
        color: canConfirm ? '#fff' : 'rgba(255,255,255,0.35)',
        cursor: canConfirm ? 'pointer' : 'not-allowed',
        borderColor: canConfirm ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
      })
    }

    if (derived.steps.length === 0) {
      const empty = document.createElement('p')
      empty.textContent = 'No steps yet. Click a vehicle to add waypoints.'
      Object.assign(empty.style, { fontSize: '12px', opacity: '0.6', margin: '0' })
      this.aside.appendChild(empty)
      return
    }

    const steps = derived.steps
    for (let i = 0; i < steps.length; i++) {
      if (i === 0) this.aside.appendChild(this.createGhostZone('before-all'))
      const step = steps[i]
      if (step.kind === 'JOURNEY') {
        this.aside.appendChild(this.buildJourneySection(step as DerivedJourneyStep, plan))
      } else {
        this.aside.appendChild(this.buildCargoSection(step as DerivedCargoStep, plan))
      }
      this.aside.appendChild(this.createGhostZone(i))
    }
    this.aside.appendChild(this.createGhostZone('after-all'))

    this.registerDraggables()
    this.registerDropTargets()
  }

  /** Create a ghost drop zone (between steps / before first / after last). Always in DOM, hidden by default. */
  private createGhostZone(afterStepIndex: number | 'before-all' | 'after-all'): HTMLElement {
    const zone = document.createElement('div')
    Object.assign(zone.style, { ...DROP_ZONE_STYLE, ...DROP_ZONE_HIDDEN })
    zone.className = 'plan-panel-drop-zone'
    zone.dataset.dropType = 'ghost'
    zone.dataset.afterStepIndex =
      afterStepIndex === 'before-all' ? 'before' : afterStepIndex === 'after-all' ? 'after' : String(afterStepIndex)
    return zone
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

  private registerDropTargets(): void {
    if (!this.aside || !this.currentDerived) return
    for (const c of this.dropTargetCleanups) c()
    this.dropTargetCleanups = []
    const steps = this.currentDerived.steps
    const zones = this.aside.querySelectorAll<HTMLElement>('.plan-panel-drop-zone')
    zones.forEach((zone) => {
      const dropType = zone.dataset.dropType
      if (dropType === 'ghost') {
        const afterRaw = zone.dataset.afterStepIndex
        const afterStepIndex: number | 'before-all' | 'after-all' =
          afterRaw === 'before' ? 'before-all' : afterRaw === 'after' ? 'after-all' : Number(afterRaw)
        const cleanup = dropTargetForElements({
          element: zone,
          getData: () => ({ type: 'ghost', afterStepIndex }),
          canDrop: ({ source }) => (source.data as { type: string }).type === 'journey' || (source.data as { type: string }).type === 'cargo',
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
                afterStepIndex === 'before-all' ? -1 : afterStepIndex === 'after-all' ? steps.length - 1 : afterStepIndex
              this.onMoveCargoStep?.(d.fromStepIndex, toAfter)
            }
          },
        })
        this.dropTargetCleanups.push(cleanup)
      } else if (dropType === 'in-step') {
        const stepIndex = Number(zone.dataset.stepIndex)
        const cleanup = dropTargetForElements({
          element: zone,
          getData: () => ({ type: 'in-step', stepIndex }),
          canDrop: ({ source }) => (source.data as { type: string }).type === 'journey',
          onDrop: ({ source }) => {
            const d = source.data as { type: string; vehicleId?: number; fromStepIndex?: number }
            if (d.type === 'journey' && d.vehicleId !== undefined && d.fromStepIndex !== undefined) {
              this.onMoveJourneyIntentIntoStep?.(d.vehicleId, d.fromStepIndex, stepIndex)
            }
          },
        })
        this.dropTargetCleanups.push(cleanup)
      }
    })
  }

  private showDropTargets(dragType: 'journey' | 'cargo'): void {
    if (!this.aside) return
    const zones = this.aside.querySelectorAll<HTMLElement>('.plan-panel-drop-zone')
    zones.forEach((zone) => {
      const dropType = zone.dataset.dropType
      if (dropType === 'ghost') {
        Object.assign(zone.style, DROP_ZONE_STYLE, { display: 'block' })
      } else if (dropType === 'in-step') {
        if (dragType === 'journey') {
          Object.assign(zone.style, DROP_ZONE_STYLE, { display: 'block', flex: '0 0 auto', minWidth: '80px' })
        }
      }
    })
    this.aside.classList.add('plan-panel-dragging')
  }

  private hideDropTargets(): void {
    this.isDragging = false
    const zones = this.aside?.querySelectorAll<HTMLElement>('.plan-panel-drop-zone')
    zones?.forEach((zone) => {
      Object.assign(zone.style, DROP_ZONE_HIDDEN)
    })
    this.aside?.classList.remove('plan-panel-dragging')
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
    journeysDiv.dataset.journeysRow = '1'
    Object.assign(journeysDiv.style, { display: 'flex', flexDirection: 'row', gap: '4px', flexWrap: 'nowrap' })

    for (const j of step.journeys) {
      const vehicle = plan.vehicles[j.vehicleId]
      const tile = this.tileApi!.getTileById(j.toTileId)
      const destText = tile?.country_name ?? 'open sea'

      const card = document.createElement('div')
      Object.assign(card.style, {
        ...JOURNEY_CARD_DEFAULT_STYLE,
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

    const inStepZone = document.createElement('div')
    Object.assign(inStepZone.style, { ...DROP_ZONE_STYLE, ...DROP_ZONE_HIDDEN, flex: '0 0 auto', minWidth: '80px' })
    inStepZone.className = 'plan-panel-drop-zone'
    inStepZone.dataset.dropType = 'in-step'
    inStepZone.dataset.stepIndex = String(step.stepIndex)
    journeysDiv.appendChild(inStepZone)

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
