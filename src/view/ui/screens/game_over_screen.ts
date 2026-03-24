const SCREEN_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  inset: '0',
  background: 'rgba(10,10,16,0.97)',
  zIndex: '100',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1.5rem',
  color: '#fff',
}

const TITLE_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '2.5rem',
  fontWeight: '700',
  letterSpacing: '0.05em',
  margin: '0',
  color: '#ff6b6b',
}

const BUTTON_STYLE: Partial<CSSStyleDeclaration> = {
  padding: '0.75rem 2.5rem',
  fontSize: '1.1rem',
  fontWeight: '600',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: '8px',
  cursor: 'pointer',
  letterSpacing: '0.04em',
}

export interface GameOverStats {
  cratesDelivered: number
  turnNumber: number
  finalBudget: number
}

export class GameOverScreen {
  onRestart: (() => void) | null = null

  private el: HTMLElement | null = null
  private statsEl: HTMLElement | null = null

  mount(container: HTMLElement): void {
    const div = document.createElement('div')
    Object.assign(div.style, SCREEN_STYLE)
    div.style.display = 'none'

    const title = document.createElement('h1')
    Object.assign(title.style, TITLE_STYLE)
    title.textContent = 'Game Over'

    const statsEl = document.createElement('div')
    Object.assign(statsEl.style, {
      fontSize: '1rem',
      opacity: '0.8',
      textAlign: 'center',
      lineHeight: '1.8',
    })

    const btn = document.createElement('button')
    Object.assign(btn.style, BUTTON_STYLE)
    btn.textContent = 'Play Again'
    btn.addEventListener('click', () => this.onRestart?.())
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.2)' })
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.12)' })

    div.appendChild(title)
    div.appendChild(statsEl)
    div.appendChild(btn)
    this.el = div
    this.statsEl = statsEl
    container.appendChild(div)
  }

  show(stats: GameOverStats): void {
    if (this.statsEl) {
      this.statsEl.innerHTML = `
        Turns survived: <strong>${stats.turnNumber}</strong><br>
        Crates delivered: <strong>${stats.cratesDelivered}</strong><br>
        Final budget: <strong style="color: #ff6b6b">${stats.finalBudget}</strong>
      `
    }
    if (this.el) this.el.style.display = 'flex'
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }
}
