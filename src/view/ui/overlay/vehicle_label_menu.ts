import { createElement, MapPin } from 'lucide'
import { hsvColor } from '../../game/color_utils'
import type { Plan } from '../../../model/types/Plan'
import type { Vehicle } from '../../../model/types/Vehicle'
import type { DerivedPlanState } from '../../../model/types/DerivedPlanState'

export interface VehicleMenuData {
  vehicleId: number
  plan: Plan
  derived: DerivedPlanState
}

export interface VehicleMenuCallbacks {
  onAddPin: () => void
  onUnload: (crateId: number) => void
}

export function buildVehicleMenu(panel: HTMLElement, data: VehicleMenuData, callbacks: VehicleMenuCallbacks): void {
  const { vehicleId, plan, derived } = data
  const vehicle = plan.vehicles[vehicleId]
  if (!vehicle) return

  const colorStyle = hsvColor(vehicle.hue).getStyle()

  panel.appendChild(buildTitle(vehicle))
  panel.appendChild(buildActionBtn(MapPin, 'Add pin / Extend route', '#fff', callbacks.onAddPin))

  const onBoardIds = [...(derived.initialSnapshot.vehicleCargo.get(vehicleId) ?? [])]
  if (onBoardIds.length > 0) {
    panel.appendChild(buildSeparator())
    for (const crateId of onBoardIds) {
      const label = plan.crates[crateId]?.destinationCountry ?? `Crate #${crateId}`
      panel.appendChild(buildCargoRow(label, colorStyle, 'Unload / Transfer →', () => callbacks.onUnload(crateId)))
    }
  }
}

// ---------------------------------------------------------------------------
// Private DOM builders
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
