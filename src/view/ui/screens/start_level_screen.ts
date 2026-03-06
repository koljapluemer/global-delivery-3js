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

const GOAL_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '1.1rem',
  color: 'rgba(255,255,255,0.75)',
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

export class StartLevelScreen {
  onStartLevel: (() => void) | null = null

  private el: HTMLElement | null = null

  mount(container: HTMLElement): void {
    const div = document.createElement('div')
    Object.assign(div.style, SCREEN_STYLE)

    const heading = document.createElement('h2')
    Object.assign(heading.style, HEADING_STYLE)
    heading.textContent = 'New Level'

    const goal = document.createElement('p')
    Object.assign(goal.style, GOAL_STYLE)
    goal.textContent = 'Earn at least 10 stamps'

    const btn = document.createElement('button')
    Object.assign(btn.style, BUTTON_STYLE)
    btn.textContent = 'Start Level'
    btn.addEventListener('click', () => this.onStartLevel?.())
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.2)' })
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.12)' })

    div.appendChild(heading)
    div.appendChild(goal)
    div.appendChild(btn)
    this.el = div
    container.appendChild(div)
  }

  show(): void {
    if (this.el) this.el.style.display = 'flex'
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }
}
