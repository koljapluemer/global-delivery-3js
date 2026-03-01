export class CancelButton {
  private el: HTMLElement | null = null

  mount(container: HTMLElement, onCancel: () => void): void {
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
      cursor: 'pointer',
      display: 'none',
    })
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      onCancel()
    })
    this.el = btn
    container.appendChild(btn)
  }

  show(): void {
    if (this.el) this.el.style.display = 'block'
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }
}
