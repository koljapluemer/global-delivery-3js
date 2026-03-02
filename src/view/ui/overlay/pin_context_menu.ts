import { createElement, Trash2 } from 'lucide'
import type { Plan } from '../../../model/types/Plan'
import type { TileCentersApi } from '../../../controller/layer_0/tile_centers_api'
import { hsvColor } from '../../game/color_utils'

export interface PinMenuCallbacks {
  onUnload: (crateId: number) => void
  onRemoveUnload: (crateId: number) => void
  onClose: () => void
}

export class PinContextMenu {
  private el: HTMLDivElement | null = null
  private outsideClickCleanup: (() => void) | null = null

  mount(container: HTMLElement): void {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'fixed',
      zIndex: '30',
      display: 'none',
      flexDirection: 'column',
      gap: '4px',
      background: 'rgba(20,20,28,0.92)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '8px',
      padding: '8px',
      minWidth: '160px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(6px)',
      pointerEvents: 'auto',
    })
    this.el = el
    container.appendChild(el)
  }

  show(
    vehicleId: number,
    stepIndex: number,
    plan: Plan,
    _tileApi: TileCentersApi,
    screenX: number,
    screenY: number,
    callbacks: PinMenuCallbacks,
  ): void {
    const el = this.el
    if (!el) return
    this.clearOutsideClickListener()

    const vehicle = plan.vehicles[vehicleId]
    if (!vehicle) return
    const currStep = plan.steps[stepIndex]
    const prevStep = plan.steps[stepIndex - 1]
    if (!currStep) return

    const colorStyle = hsvColor(vehicle.hue).getStyle()

    // Build cargo-on-board list: crates in currStep.transportedCargo for this vehicle
    const onBoard: Array<{ crateId: number; label: string }> = []
    for (const [crateIdStr, vId] of Object.entries(currStep.transportedCargo)) {
      if (vId !== vehicleId) continue
      const crateId = Number(crateIdStr)
      const crate = plan.crates[crateId]
      onBoard.push({ crateId, label: crate?.destinationCountry ?? `Crate #${crateId}` })
    }

    // Build dropped-off-here list: crates that were in prevStep.transportedCargo for this vehicle
    // and are now in currStep.tileOccupations (on the ground)
    const droppedOff: Array<{ crateId: number; label: string }> = []
    if (prevStep) {
      for (const [crateIdStr, vId] of Object.entries(prevStep.transportedCargo)) {
        if (vId !== vehicleId) continue
        if (crateIdStr in currStep.transportedCargo) continue // still carried
        const crateId = Number(crateIdStr)
        const onGround = Object.values(currStep.tileOccupations).some(
          ([kind, id]) => kind === 'CRATE' && id === crateId,
        )
        if (!onGround) continue
        const crate = plan.crates[crateId]
        droppedOff.push({ crateId, label: crate?.destinationCountry ?? `Crate #${crateId}` })
      }
    }

    // Rebuild contents
    el.innerHTML = ''

    const title = document.createElement('div')
    title.textContent = vehicle.name
    Object.assign(title.style, {
      fontSize: '11px',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.5)',
      marginBottom: '4px',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    })
    el.appendChild(title)

    if (onBoard.length === 0 && droppedOff.length === 0) {
      const empty = document.createElement('div')
      empty.textContent = 'No cargo'
      Object.assign(empty.style, { fontSize: '12px', color: 'rgba(255,255,255,0.4)', padding: '4px 0' })
      el.appendChild(empty)
    }

    for (const { crateId, label } of onBoard) {
      el.appendChild(this.buildOnBoardRow(crateId, label, colorStyle, callbacks))
    }

    for (const { crateId, label } of droppedOff) {
      el.appendChild(this.buildDroppedOffRow(crateId, label, colorStyle, callbacks))
    }

    // Position: grows upward from the click point
    el.style.display = 'flex'
    el.style.left = `${screenX}px`
    el.style.bottom = `${window.innerHeight - screenY}px`
    el.style.transform = 'translateX(-50%)'

    // Outside-click closes the menu after a tick (so this click doesn't immediately close it)
    setTimeout(() => {
      const handler = (ev: MouseEvent) => {
        if (!el.contains(ev.target as Node)) {
          callbacks.onClose()
          this.hide()
        }
      }
      document.addEventListener('mousedown', handler, { once: true })
      this.outsideClickCleanup = () => document.removeEventListener('mousedown', handler)
    }, 0)
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
    this.clearOutsideClickListener()
  }

  get isVisible(): boolean {
    return this.el?.style.display !== 'none'
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildOnBoardRow(
    crateId: number,
    label: string,
    colorStyle: string,
    callbacks: PinMenuCallbacks,
  ): HTMLElement {
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
    btn.textContent = 'Unload here →'
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
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      callbacks.onUnload(crateId)
    })
    row.appendChild(btn)
    return row
  }

  private buildDroppedOffRow(
    crateId: number,
    label: string,
    colorStyle: string,
    callbacks: PinMenuCallbacks,
  ): HTMLElement {
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
    text.textContent = label + ' ✓'
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
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      callbacks.onRemoveUnload(crateId)
    })
    row.appendChild(btn)
    return row
  }

  private clearOutsideClickListener(): void {
    this.outsideClickCleanup?.()
    this.outsideClickCleanup = null
  }
}
