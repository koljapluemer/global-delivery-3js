import type { LevelStats } from '../../../model/types/LevelStats'

const STAMPS_GOAL = 10

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

const HEADING_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '1.8rem',
  fontWeight: '700',
  margin: '0',
}

const STAT_LIST_STYLE: Partial<CSSStyleDeclaration> = {
  listStyle: 'none',
  padding: '0',
  margin: '0',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  alignItems: 'center',
  fontSize: '1rem',
  color: 'rgba(255,255,255,0.8)',
}

const RESULT_STYLE_SUCCESS: Partial<CSSStyleDeclaration> = {
  fontSize: '1.4rem',
  fontWeight: '700',
  color: '#7fff7f',
  margin: '0',
}

const RESULT_STYLE_FAIL: Partial<CSSStyleDeclaration> = {
  fontSize: '1.4rem',
  fontWeight: '700',
  color: '#ff6b6b',
  margin: '0',
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
  marginTop: '0.5rem',
}

export class LevelEvaluationScreen {
  onNext: (() => void) | null = null
  onBackToMenu: (() => void) | null = null

  private el: HTMLElement | null = null

  mount(container: HTMLElement): void {
    const div = document.createElement('div')
    Object.assign(div.style, SCREEN_STYLE)
    this.el = div
    container.appendChild(div)
  }

  update(stats: LevelStats): void {
    if (!this.el) return
    this.el.innerHTML = ''

    const success = stats.stampsEarned >= STAMPS_GOAL

    const heading = document.createElement('h2')
    Object.assign(heading.style, HEADING_STYLE)
    heading.textContent = 'Level Complete'

    const resultMsg = document.createElement('p')
    Object.assign(resultMsg.style, success ? RESULT_STYLE_SUCCESS : RESULT_STYLE_FAIL)
    resultMsg.textContent = success ? 'Success!' : 'Goal not reached'

    const statList = document.createElement('ul')
    Object.assign(statList.style, STAT_LIST_STYLE)

    const statItems: Array<[string, string]> = [
      ['Crates delivered', String(stats.cratesDelivered)],
      ['Distance driven', `${stats.pathTilesTraversed} tiles`],
      ['Money earned', `$${stats.moneyEarned}`],
      ['Stamps earned', `★ ${stats.stampsEarned} / ${STAMPS_GOAL}`],
    ]
    for (const [label, value] of statItems) {
      const li = document.createElement('li')
      li.innerHTML = `<span style="color:rgba(255,255,255,0.5)">${label}:</span> <strong>${value}</strong>`
      statList.appendChild(li)
    }

    const btn = document.createElement('button')
    Object.assign(btn.style, BUTTON_STYLE)
    if (success) {
      btn.textContent = 'Next'
      btn.addEventListener('click', () => this.onNext?.())
    } else {
      btn.textContent = 'Back to Menu'
      btn.addEventListener('click', () => this.onBackToMenu?.())
    }
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.2)' })
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.12)' })

    this.el.appendChild(heading)
    this.el.appendChild(resultMsg)
    this.el.appendChild(statList)
    this.el.appendChild(btn)
  }

  show(): void {
    if (this.el) this.el.style.display = 'flex'
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }
}
