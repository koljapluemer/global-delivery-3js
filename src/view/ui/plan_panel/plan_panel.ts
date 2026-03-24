import { createElement, Trash2 } from 'lucide'
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import type { Plan, CargoIntent } from '../../../model/types/Plan'
import type { DerivedPlanState, DerivedJourneyStep, DerivedCargoStep, DerivedCargoAction } from '../../../model/types/DerivedPlanState'
import type { TileCentersApi } from '../../../controller/layer_0/tile_centers_api'
import type { EntityTarget } from '../../../model/types/EntityTarget'
import type { TurnEconomy } from '../../../controller/turn_economy'
import { snapshotBefore } from '../../../controller/plan_deriver'

const DROP_ZONE_STYLE: Record<string, string> = {
  minHeight: '24px',
  borderRadius: '6px',
  margin: '4px 0',
  border: '1px dashed rgba(255,255,255,0.35)',
  transition: 'background 0.15s, border-color 0.15s',
  boxSizing: 'border-box',
}

const DROP_ZONE_HIDDEN = { display: 'none' as const }

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
  onFocusTile: ((tileId: number) => void) | null = null
  onFocusEntity: ((target: EntityTarget) => void) | null = null

  private containerEl: HTMLElement | null = null
  private headerEl: HTMLElement | null = null
  private stepsEl: HTMLElement | null = null
  private countryFooterEl: HTMLElement | null = null
  private tileApi: TileCentersApi | null = null
  private draggableCleanups: Array<() => void> = []
  private dropTargetCleanups: Array<() => void> = []
  private monitorCleanup: (() => void) | null = null
  private currentPlan: Plan | null = null
  private currentDerived: DerivedPlanState | null = null
  private isDragging = false

  mount(container: HTMLElement, tileApi: TileCentersApi): void {
    const aside = document.createElement('aside')
    Object.assign(aside.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(0,0,0,0.6)',
      color: '#fff',
      zIndex: '10',
      minWidth: '220px',
      maxWidth: '300px',
      overflow: 'hidden',
    })

    // --- Header: score + economy + End Turn button ---
    const header = document.createElement('div')
    Object.assign(header.style, {
      padding: '0.75rem 1rem 0',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      flexShrink: '0',
    })
    aside.appendChild(header)

    // --- Scrollable steps area ---
    const stepsEl = document.createElement('div')
    Object.assign(stepsEl.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '0.75rem 1rem',
    })
    aside.appendChild(stepsEl)

    // --- Country hover footer ---
    const countryFooter = document.createElement('div')
    Object.assign(countryFooter.style, {
      padding: '0.4rem 1rem',
      fontSize: '11px',
      opacity: '0.6',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      minHeight: '24px',
      flexShrink: '0',
    })
    aside.appendChild(countryFooter)

    this.containerEl = aside
    this.headerEl = header
    this.stepsEl = stepsEl
    this.countryFooterEl = countryFooter
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
    this.headerEl = null
    this.stepsEl = null
    this.countryFooterEl = null
    this.tileApi = null
  }

  hide(): void {
    if (this.containerEl) this.containerEl.style.display = 'none'
  }

  show(): void {
    if (this.containerEl) this.containerEl.style.display = 'flex'
  }

  updateHoveredCountry(name: string | null): void {
    if (this.countryFooterEl) {
      this.countryFooterEl.textContent = name ?? ''
    }
  }

  update(plan: Plan, derived: DerivedPlanState, economy: TurnEconomy, score: { turnNumber: number; cratesDelivered: number }, canConfirm: boolean): void {
    if (!this.headerEl || !this.stepsEl || !this.tileApi) return
    if (this.isDragging) return
    this.currentPlan = plan
    this.currentDerived = derived

    this.renderHeader(economy, score, canConfirm)
    this.renderSteps(plan, derived)
  }

  private renderHeader(economy: TurnEconomy, score: { turnNumber: number; cratesDelivered: number }, canConfirm: boolean): void {
    if (!this.headerEl) return
    this.headerEl.innerHTML = ''

    // Score row
    const scoreRow = document.createElement('div')
    Object.assign(scoreRow.style, {
      display: 'flex',
      gap: '0.75rem',
      fontSize: '12px',
      fontWeight: '600',
      marginBottom: '0.6rem',
      opacity: '0.9',
    })
    const turnEl = document.createElement('span')
    turnEl.textContent = `Turn ${score.turnNumber + 1}`
    const cratesEl = document.createElement('span')
    cratesEl.textContent = `${score.cratesDelivered} delivered`
    Object.assign(cratesEl.style, { opacity: '0.7' })
    scoreRow.appendChild(turnEl)
    scoreRow.appendChild(cratesEl)
    this.headerEl.appendChild(scoreRow)

    // Economy table
    const table = document.createElement('div')
    Object.assign(table.style, {
      fontSize: '12px',
      marginBottom: '0.6rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    })

    const row = (label: string, value: number, sign: '+' | '-' | ''): HTMLElement => {
      const el = document.createElement('div')
      Object.assign(el.style, {
        display: 'flex',
        justifyContent: 'space-between',
        opacity: '0.85',
      })
      const labelEl = document.createElement('span')
      labelEl.textContent = label
      Object.assign(labelEl.style, { opacity: '0.7' })
      const valueEl = document.createElement('span')
      valueEl.textContent = sign === '+' ? `+${value}` : sign === '-' ? `-${value}` : `${value}`
      el.appendChild(labelEl)
      el.appendChild(valueEl)
      return el
    }

    table.appendChild(row('Budget', economy.currentBudget, ''))
    table.appendChild(row('Travel Time Cost', economy.travelCost, '-'))
    table.appendChild(row('Turn Fee', economy.turnFee, '-'))
    table.appendChild(row('Delivery Reward', economy.reward, '+'))

    const divider = document.createElement('div')
    Object.assign(divider.style, {
      borderTop: '1px solid rgba(255,255,255,0.2)',
      margin: '3px 0',
    })
    table.appendChild(divider)

    const afterRow = document.createElement('div')
    Object.assign(afterRow.style, {
      display: 'flex',
      justifyContent: 'space-between',
      fontWeight: '600',
      fontSize: '12px',
    })
    const afterLabel = document.createElement('span')
    afterLabel.textContent = 'After Turn'
    const afterValue = document.createElement('span')
    afterValue.textContent = String(economy.afterTurn)
    afterValue.style.color = economy.afterTurn <= 0 ? '#ff6b6b' : '#fff'
    afterRow.appendChild(afterLabel)
    afterRow.appendChild(afterValue)
    table.appendChild(afterRow)

    this.headerEl.appendChild(table)

    // End Turn button
    const confirmBtn = document.createElement('button')
    Object.assign(confirmBtn.style, {
      width: '100%',
      padding: '0.45rem',
      marginBottom: '0.75rem',
      fontSize: '13px',
      fontWeight: '600',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.25)',
      cursor: 'pointer',
      letterSpacing: '0.03em',
      background: canConfirm ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
      color: canConfirm ? '#fff' : 'rgba(255,255,255,0.35)',
    })
    if (!canConfirm) {
      confirmBtn.style.cursor = 'not-allowed'
      confirmBtn.style.borderColor = 'rgba(255,255,255,0.1)'
    }
    confirmBtn.disabled = !canConfirm
    confirmBtn.textContent = 'End Turn'
    confirmBtn.addEventListener('click', () => { if (!confirmBtn.disabled) this.onConfirmPlan?.() })
    confirmBtn.addEventListener('mouseenter', () => {
      if (!confirmBtn.disabled) confirmBtn.style.background = 'rgba(255,255,255,0.22)'
    })
    confirmBtn.addEventListener('mouseleave', () => {
      if (!confirmBtn.disabled) confirmBtn.style.background = 'rgba(255,255,255,0.12)'
    })
    this.headerEl.appendChild(confirmBtn)
  }

  private renderSteps(plan: Plan, derived: DerivedPlanState): void {
    if (!this.stepsEl) return

    for (const c of this.draggableCleanups) c()
    this.draggableCleanups = []
    for (const c of this.dropTargetCleanups) c()
    this.dropTargetCleanups = []

    this.stepsEl.innerHTML = ''

    if (derived.steps.length === 0) {
      const empty = document.createElement('p')
      empty.textContent = 'No steps yet. Click a vehicle to add waypoints.'
      Object.assign(empty.style, { fontSize: '12px', opacity: '0.6', margin: '0' })
      this.stepsEl.appendChild(empty)
      return
    }

    const steps = derived.steps
    let journeyNum = 0
    for (let i = 0; i < steps.length; i++) {
      if (i === 0) this.stepsEl.appendChild(this.createGhostZone('before-all'))
      const step = steps[i]
      if (step.kind === 'JOURNEY') {
        journeyNum++
        this.stepsEl.appendChild(this.buildJourneySection(step as DerivedJourneyStep, plan, journeyNum))
      } else {
        this.stepsEl.appendChild(this.buildCargoSection(step as DerivedCargoStep, plan))
      }
      this.stepsEl.appendChild(this.createGhostZone(i))
    }
    this.stepsEl.appendChild(this.createGhostZone('after-all'))

    this.registerDraggables()
    this.registerDropTargets()
  }

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
    if (!this.stepsEl || !this.currentPlan || !this.currentDerived) return
    const journeyCards = this.stepsEl.querySelectorAll<HTMLElement>('[data-draggable="journey"]')
    const cargoCards = this.stepsEl.querySelectorAll<HTMLElement>('[data-draggable="cargo"]')
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
    if (!this.stepsEl || !this.currentDerived) return
    for (const c of this.dropTargetCleanups) c()
    this.dropTargetCleanups = []
    const steps = this.currentDerived.steps
    const zones = this.stepsEl.querySelectorAll<HTMLElement>('.plan-panel-drop-zone')
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
    if (!this.stepsEl) return
    const zones = this.stepsEl.querySelectorAll<HTMLElement>('.plan-panel-drop-zone')
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
    this.stepsEl.classList.add('plan-panel-dragging')
  }

  private hideDropTargets(): void {
    this.isDragging = false
    const zones = this.stepsEl?.querySelectorAll<HTMLElement>('.plan-panel-drop-zone')
    zones?.forEach((zone) => {
      Object.assign(zone.style, DROP_ZONE_HIDDEN)
    })
    this.stepsEl?.classList.remove('plan-panel-dragging')
  }

  private buildJourneySection(step: DerivedJourneyStep, plan: Plan, journeyNum: number): HTMLElement {
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
    labelSpan.textContent = `Journey ${journeyNum}`
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
      Object.assign(text.style, { fontSize: '12px', flex: '1', cursor: 'pointer' })
      text.addEventListener('click', (e) => {
        e.stopPropagation()
        this.onFocusTile?.(j.toTileId)
        this.onFocusEntity?.({ kind: 'VEHICLE', id: j.vehicleId })
      })

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
    Object.assign(text.style, { fontSize: '11px', flex: '1', cursor: 'pointer' })
    text.addEventListener('click', (e) => {
      e.stopPropagation()
      const intent = action.intent
      let tileId: number | undefined
      if (intent.kind === 'LOAD') {
        tileId = this.currentDerived
          ? snapshotBefore(this.currentDerived, stepIndex).vehiclePositions.get(intent.vehicleId)
          : undefined
      } else {
        tileId = intent.toTileId
      }
      if (tileId !== undefined) this.onFocusTile?.(tileId)
      this.onFocusEntity?.({ kind: 'CRATE', id: intent.crateId })
    })

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
