export class CancelButton {
  private el: HTMLElement | null = null
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null

  mount(container: HTMLElement, onCancel: () => void): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }

    const btn = document.createElement('button')
    btn.textContent = 'Cancel'
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '1.5rem',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '20',
      padding: '0.5rem 1.5rem',
      fontSize: '1rem',
      fontWeight: '500',
      background: 'rgba(255,255,255,0.08)',
      color: '#ccc',
      border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '8px',
      cursor: 'pointer',
      letterSpacing: '0.03em',
      display: 'none',
    })
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      onCancel()
    })
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.15)' })
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.08)' })
    this.el = btn
    container.appendChild(btn)
  }

  show(): void {
    if (this.el) this.el.style.display = 'block'
    if (this.keydownHandler) document.addEventListener('keydown', this.keydownHandler)
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
    if (this.keydownHandler) document.removeEventListener('keydown', this.keydownHandler)
  }
}
