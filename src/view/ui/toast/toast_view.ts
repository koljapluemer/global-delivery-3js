import type { GameEvent } from '../../../model/types/GameEvent'

const ACCENT: Record<GameEvent['kind'], string> = {
  CRATE_DELIVERED: '#4caf50',
  VEHICLE_ARRIVED: '#2196f3',
  INVALID_ACTION: '#f44336',
}

function formatMessage(event: GameEvent): string {
  switch (event.kind) {
    case 'CRATE_DELIVERED': return `Crate delivered to ${event.countryName} (+${event.reward})`
    case 'VEHICLE_ARRIVED': return `${event.vehicleName} arrived in ${event.countryName}`
    case 'INVALID_ACTION': return event.message
  }
}

function buildCard(event: GameEvent): HTMLElement {
  const card = document.createElement('div')
  Object.assign(card.style, {
    background: 'rgba(14,16,24,0.88)',
    backdropFilter: 'blur(6px)',
    borderLeft: `3px solid ${ACCENT[event.kind]}`,
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: '1.4',
    flexShrink: '0',
    opacity: '0',
    transform: 'translateY(16px)',
  })
  card.textContent = formatMessage(event)
  return card
}

export class ToastView {
  private container: HTMLElement | null = null
  private scrollEl: HTMLElement | null = null

  mount(parent: HTMLElement): void {
    const container = document.createElement('div')
    Object.assign(container.style, {
      position: 'fixed',
      top: '60px',
      right: '12px',
      width: '280px',
      zIndex: '20',
      pointerEvents: 'none',
    })

    const scrollEl = document.createElement('div')
    Object.assign(scrollEl.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      maxHeight: '186px',
      overflowY: 'auto',
      pointerEvents: 'auto',
      scrollbarWidth: 'none',
    })
    // Hide webkit scrollbar
    const style = document.createElement('style')
    style.textContent = '.toast-scroll::-webkit-scrollbar { display: none; }'
    scrollEl.classList.add('toast-scroll')
    document.head.appendChild(style)

    container.appendChild(scrollEl)
    parent.appendChild(container)
    this.container = container
    this.scrollEl = scrollEl
  }

  push(event: GameEvent): void {
    const scrollEl = this.scrollEl
    if (!scrollEl) return

    const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 2

    const card = buildCard(event)
    scrollEl.appendChild(card)

    // Animate in on next frame
    requestAnimationFrame(() => {
      Object.assign(card.style, {
        transition: 'opacity 0.25s ease, transform 0.25s ease',
        opacity: '1',
        transform: 'translateY(0)',
      })
    })

    if (atBottom) {
      requestAnimationFrame(() => {
        scrollEl.scrollTop = scrollEl.scrollHeight
      })
    }
  }

  unmount(): void {
    this.container?.remove()
    this.container = null
    this.scrollEl = null
  }
}
