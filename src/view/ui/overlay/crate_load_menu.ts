import type { Plan } from '../../../model/types/Plan'

export interface CrateLoadMenuCallbacks {
  onLoad: () => void
  onClose: () => void
}

export class CrateLoadMenu {
  private el: HTMLDivElement | null = null
  private outsideClickCleanup: (() => void) | null = null

  mount(container: HTMLElement): void {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'fixed',
      zIndex: '30',
      display: 'none',
      flexDirection: 'column',
      gap: '6px',
      background: 'rgba(20,20,28,0.92)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '8px',
      padding: '8px',
      minWidth: '140px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(6px)',
      pointerEvents: 'auto',
    })
    this.el = el
    container.appendChild(el)
  }

  show(
    crateId: number,
    plan: Plan,
    screenX: number,
    screenY: number,
    callbacks: CrateLoadMenuCallbacks,
  ): void {
    const el = this.el
    if (!el) return
    this.clearOutsideClickListener()

    const crate = plan.crates[crateId]
    el.innerHTML = ''

    const label = document.createElement('div')
    label.textContent = crate?.destinationCountry ?? `Crate #${crateId}`
    Object.assign(label.style, {
      fontSize: '11px',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.5)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    })
    el.appendChild(label)

    const btn = document.createElement('button')
    btn.textContent = 'Load into vehicle →'
    Object.assign(btn.style, {
      fontSize: '12px',
      background: 'rgba(255,255,255,0.12)',
      color: '#fff',
      border: 'none',
      borderRadius: '5px',
      padding: '6px 10px',
      cursor: 'pointer',
      textAlign: 'left',
    })
    btn.addEventListener('mousedown', (e) => { e.stopPropagation() })
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      callbacks.onLoad()
    })
    el.appendChild(btn)

    el.style.display = 'flex'
    el.style.left = `${screenX}px`
    el.style.bottom = `${window.innerHeight - screenY}px`
    el.style.transform = 'translateX(-50%)'

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

  private clearOutsideClickListener(): void {
    this.outsideClickCleanup?.()
    this.outsideClickCleanup = null
  }
}
