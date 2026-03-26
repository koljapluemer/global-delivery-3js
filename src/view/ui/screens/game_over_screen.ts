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

const SECONDARY_BUTTON_STYLE: Partial<CSSStyleDeclaration> = {
  padding: '0.5rem 1.5rem',
  fontSize: '0.95rem',
  fontWeight: '500',
  background: 'rgba(255,255,255,0.08)',
  color: '#ccc',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px',
  cursor: 'pointer',
  letterSpacing: '0.03em',
}

export interface GameOverStats {
  cratesDelivered: number
  turnNumber: number
  finalBudget: number
  seed: number
}

export class GameOverScreen {
  onRestart: (() => void) | null = null
  onMainMenu: (() => void) | null = null

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

    const btnRow = document.createElement('div')
    Object.assign(btnRow.style, {
      display: 'flex',
      gap: '1rem',
      alignItems: 'center',
    })

    const restartBtn = document.createElement('button')
    Object.assign(restartBtn.style, BUTTON_STYLE)
    restartBtn.textContent = 'Play Again'
    restartBtn.addEventListener('click', () => this.onRestart?.())
    restartBtn.addEventListener('mouseenter', () => { restartBtn.style.background = 'rgba(255,255,255,0.2)' })
    restartBtn.addEventListener('mouseleave', () => { restartBtn.style.background = 'rgba(255,255,255,0.12)' })

    const menuBtn = document.createElement('button')
    Object.assign(menuBtn.style, SECONDARY_BUTTON_STYLE)
    menuBtn.textContent = 'Main Menu'
    menuBtn.addEventListener('click', () => this.onMainMenu?.())
    menuBtn.addEventListener('mouseenter', () => { menuBtn.style.background = 'rgba(255,255,255,0.15)' })
    menuBtn.addEventListener('mouseleave', () => { menuBtn.style.background = 'rgba(255,255,255,0.08)' })

    btnRow.appendChild(restartBtn)
    btnRow.appendChild(menuBtn)

    div.appendChild(title)
    div.appendChild(statsEl)
    div.appendChild(btnRow)
    this.el = div
    this.statsEl = statsEl
    container.appendChild(div)
  }

  show(stats: GameOverStats): void {
    if (this.statsEl) {
      this.statsEl.innerHTML = `
        Turns survived: <strong>${stats.turnNumber}</strong><br>
        Crates delivered: <strong>${stats.cratesDelivered}</strong><br>
        Final budget: <strong style="color: #ff6b6b">${stats.finalBudget}</strong><br>
        Seed: <strong style="color: rgba(255,255,255,0.6)">${stats.seed}</strong>
      `
    }
    if (this.el) this.el.style.display = 'flex'
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }
}
