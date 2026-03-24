import { createElement, MapPin, Trash2 } from 'lucide'
import { hsvColor } from '../../game/color_utils'
import type { Plan } from '../../../model/types/Plan'
import type { Vehicle } from '../../../model/types/Vehicle'
import type { DerivedPlanState } from '../../../model/types/DerivedPlanState'

export interface PinMenuData {
  vehicleId: number
  stepIndex: number
  plan: Plan
  derived: DerivedPlanState
}

export interface PinMenuCallbacks {
  onAddPinAfter: () => void
  onRemovePin: () => void
  onUnload: (crateId: number) => void
  onRemoveUnload: (cargoStepIndex: number) => void
}

export function buildPinMenu(panel: HTMLElement, data: PinMenuData, callbacks: PinMenuCallbacks): void {
  const { vehicleId, stepIndex, plan, derived } = data
  const vehicle = plan.vehicles[vehicleId]
  if (!vehicle) return

  const colorStyle = hsvColor(vehicle.hue).getStyle()

  panel.appendChild(buildTitle(vehicle))
  panel.appendChild(buildActionBtn(MapPin, 'Add pin after', '#fff', callbacks.onAddPinAfter))
  panel.appendChild(buildActionBtn(Trash2, 'Remove pin', '#ff6b6b', callbacks.onRemovePin))

  const snapshot = derived.stepSnapshots[stepIndex]
  const droppedOff = collectDroppedOff(plan, derived, vehicleId, stepIndex)
  const droppedOffIds = new Set(droppedOff.map((d) => d.crateId))
  const onBoardIds = snapshot
    ? [...(snapshot.vehicleCargo.get(vehicleId) ?? [])].filter((id) => !droppedOffIds.has(id))
    : []
  if (onBoardIds.length > 0) {
    panel.appendChild(buildSeparator())
    for (const crateId of onBoardIds) {
      const label = plan.crates[crateId]?.destinationCountry ?? `Crate #${crateId}`
      panel.appendChild(buildCargoRow(label, colorStyle, 'Unload / Transfer →', () => callbacks.onUnload(crateId)))
    }
  }

  if (droppedOff.length > 0) panel.appendChild(buildSeparator())
  for (const { label, cargoStepIndex } of droppedOff) {
    panel.appendChild(buildDroppedOffRow(label + ' ✓', colorStyle, () => callbacks.onRemoveUnload(cargoStepIndex)))
  }
}

// ---------------------------------------------------------------------------
// Private DOM builders — each creates exactly one element type
// ---------------------------------------------------------------------------

function buildTitle(vehicle: Vehicle): HTMLDivElement {
  const el = document.createElement('div')
  el.textContent = vehicle.name
  Object.assign(el.style, {
    fontSize: '11px',
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: '2px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  })
  return el
}

function buildActionBtn(
  icon: Parameters<typeof createElement>[0],
  label: string,
  color: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button')
  Object.assign(btn.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '5px',
    padding: '5px 8px',
    cursor: 'pointer',
    color,
    fontSize: '12px',
    fontWeight: '500',
    textAlign: 'left',
  })
  btn.appendChild(createElement(icon, { width: 13, height: 13 }))
  const text = document.createElement('span')
  text.textContent = label
  btn.appendChild(text)
  btn.addEventListener('mousedown', (e) => { e.stopPropagation() })
  btn.addEventListener('click', (e) => { e.stopPropagation(); onClick() })
  return btn
}

function buildSeparator(): HTMLHRElement {
  const hr = document.createElement('hr')
  Object.assign(hr.style, {
    border: 'none',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    margin: '2px 0',
  })
  return hr
}

function buildCargoRow(label: string, colorStyle: string, btnText: string, onClick: () => void): HTMLElement {
  const row = document.createElement('div')
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: colorStyle,
    borderRadius: '5px',
    padding: '5px 7px',
  })
  const text = document.createElement('span')
  text.textContent = label
  Object.assign(text.style, { fontSize: '12px', color: '#fff', flex: '1', fontWeight: '500' })
  row.appendChild(text)
  const btn = document.createElement('button')
  btn.textContent = btnText
  Object.assign(btn.style, {
    fontSize: '11px',
    background: 'rgba(0,0,0,0.25)',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '3px 7px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })
  btn.addEventListener('mousedown', (e) => { e.stopPropagation() })
  btn.addEventListener('click', (e) => { e.stopPropagation(); onClick() })
  row.appendChild(btn)
  return row
}

function buildDroppedOffRow(label: string, colorStyle: string, onRemove: () => void): HTMLElement {
  const row = document.createElement('div')
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: colorStyle,
    borderRadius: '5px',
    padding: '5px 7px',
    opacity: '0.75',
  })
  const text = document.createElement('span')
  text.textContent = label
  Object.assign(text.style, { fontSize: '12px', color: '#fff', flex: '1', fontWeight: '500' })
  row.appendChild(text)
  const btn = document.createElement('button')
  btn.appendChild(createElement(Trash2, { width: 13, height: 13 }))
  Object.assign(btn.style, {
    background: 'rgba(0,0,0,0.25)',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '3px 6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  })
  btn.addEventListener('mousedown', (e) => { e.stopPropagation() })
  btn.addEventListener('click', (e) => { e.stopPropagation(); onRemove() })
  row.appendChild(btn)
  return row
}

// ---------------------------------------------------------------------------
// Pure data helper — no DOM, no side effects
// ---------------------------------------------------------------------------

function collectDroppedOff(
  plan: Plan,
  derived: DerivedPlanState,
  vehicleId: number,
  stepIndex: number,
): Array<{ crateId: number; label: string; cargoStepIndex: number }> {
  const result: Array<{ crateId: number; label: string; cargoStepIndex: number }> = []
  for (let i = stepIndex + 1; i < plan.steps.length && plan.steps[i].kind === 'CARGO'; i++) {
    const cargoStep = derived.steps.find((s) => s.kind === 'CARGO' && s.stepIndex === i)
    if (!cargoStep || cargoStep.kind !== 'CARGO' || !cargoStep.action.valid) continue
    const { intent } = cargoStep.action
    if ((intent.kind === 'UNLOAD' || intent.kind === 'DELIVER') && intent.vehicleId === vehicleId) {
      result.push({
        crateId: intent.crateId,
        label: plan.crates[intent.crateId]?.destinationCountry ?? `Crate #${intent.crateId}`,
        cargoStepIndex: i,
      })
    }
  }
  return result
}
