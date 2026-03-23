import { createElement, MapPin } from 'lucide'
import type { Plan } from '../../../model/types/Plan'
import type { Vehicle } from '../../../model/types/Vehicle'

export interface VehicleMenuData {
  vehicleId: number
  plan: Plan
}

export interface VehicleMenuCallbacks {
  onAddPin: () => void
}

export function buildVehicleMenu(panel: HTMLElement, data: VehicleMenuData, callbacks: VehicleMenuCallbacks): void {
  const vehicle = data.plan.vehicles[data.vehicleId]
  if (!vehicle) return
  panel.appendChild(buildTitle(vehicle))
  panel.appendChild(buildActionBtn(MapPin, 'Add pin / Extend route', '#fff', callbacks.onAddPin))
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
