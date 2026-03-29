import type { GameSeed } from '../../../model/types/GameSeed'
import { dailySeed } from '../../../util/daily_seed'

function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

const BUTTON_WIDTH = '220px'

const SCREEN_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  inset: '0',
  background: 'rgba(10,10,16,0.97)',
  zIndex: '100',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  color: '#fff',
}

const TITLE_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '2.5rem',
  fontWeight: '700',
  letterSpacing: '0.05em',
  margin: '0 0 0.75rem 0',
}

const BTN_PLAY: Partial<CSSStyleDeclaration> = {
  width: BUTTON_WIDTH,
  padding: '0.9rem 0',
  fontSize: '1.2rem',
  fontWeight: '600',
  borderRadius: '8px',
  cursor: 'pointer',
  letterSpacing: '0.04em',
  border: '1px solid rgba(255,255,255,0.22)',
  background: 'rgba(255,255,255,0.10)',
  color: '#fff',
}

const BTN_SECONDARY: Partial<CSSStyleDeclaration> = {
  width: BUTTON_WIDTH,
  padding: '0.65rem 0',
  fontSize: '0.95rem',
  fontWeight: '500',
  borderRadius: '8px',
  cursor: 'pointer',
  letterSpacing: '0.03em',
  border: '1px solid rgba(255,255,255,0.13)',
  background: 'rgba(255,255,255,0.06)',
  color: '#ccc',
}

function makeButton(text: string, play = false): HTMLButtonElement {
  const btn = document.createElement('button')
  Object.assign(btn.style, play ? BTN_PLAY : BTN_SECONDARY)
  btn.textContent = text
  const hoverBg = play ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.12)'
  const restBg = play ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'
  btn.addEventListener('mouseenter', () => { btn.style.background = hoverBg })
  btn.addEventListener('mouseleave', () => { btn.style.background = restBg })
  return btn
}

export class MainMenuScreen {
  onStartGame: ((seed: GameSeed) => void) | null = null
  onStartTutorial: (() => void) | null = null

  private el: HTMLElement | null = null

  mount(container: HTMLElement): void {
    const div = document.createElement('div')
    Object.assign(div.style, SCREEN_STYLE)

    div.appendChild(this.buildTitle())
    div.appendChild(this.buildPlayButton())
    div.appendChild(this.buildDailyButton())
    div.appendChild(this.buildTutorialButton())
    div.appendChild(this.buildSeededButton())

    this.el = div
    container.appendChild(div)
  }

  show(): void {
    if (this.el) this.el.style.display = 'flex'
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }

  private buildTitle(): HTMLHeadingElement {
    const title = document.createElement('h1')
    Object.assign(title.style, TITLE_STYLE)
    title.textContent = 'Global Delivery'
    return title
  }

  private buildPlayButton(): HTMLButtonElement {
    const btn = makeButton('Play', true)
    btn.addEventListener('click', () => this.onStartGame?.({ value: randomSeed() }))
    return btn
  }

  private buildDailyButton(): HTMLButtonElement {
    const btn = makeButton('Daily Challenge')
    btn.addEventListener('click', () => this.onStartGame?.({ value: dailySeed(), autoPlace: true }))
    return btn
  }

  private buildTutorialButton(): HTMLButtonElement {
    const btn = makeButton('Tutorial')
    btn.addEventListener('click', () => this.onStartTutorial?.())
    return btn
  }

  private buildSeededButton(): HTMLButtonElement {
    const btn = makeButton('Seeded Game')
    btn.addEventListener('click', () => this.openSeedModal())
    return btn
  }

  private openSeedModal(): void {
    const backdrop = document.createElement('div')
    Object.assign(backdrop.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '200',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
    })

    const modal = document.createElement('div')
    Object.assign(modal.style, {
      background: 'rgba(18,18,26,0.98)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: '12px',
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1rem',
      minWidth: '280px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
    })

    const heading = document.createElement('h2')
    Object.assign(heading.style, {
      margin: '0',
      fontSize: '1.2rem',
      fontWeight: '600',
      color: '#fff',
      letterSpacing: '0.04em',
    })
    heading.textContent = 'Seeded Game'

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Enter seed (text or number)'
    Object.assign(input.style, {
      width: '100%',
      padding: '0.5rem 0.75rem',
      fontSize: '0.95rem',
      background: 'rgba(255,255,255,0.08)',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '6px',
      textAlign: 'center',
      boxSizing: 'border-box',
    })

    const buttons = document.createElement('div')
    Object.assign(buttons.style, {
      display: 'flex',
      gap: '0.6rem',
      width: '100%',
    })

    const cancelBtn = document.createElement('button')
    Object.assign(cancelBtn.style, {
      flex: '1',
      padding: '0.55rem 0',
      fontSize: '0.95rem',
      fontWeight: '500',
      background: 'rgba(255,255,255,0.06)',
      color: '#aaa',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '7px',
      cursor: 'pointer',
    })
    cancelBtn.textContent = 'Cancel'
    cancelBtn.addEventListener('click', () => backdrop.remove())

    const playBtn = document.createElement('button')
    Object.assign(playBtn.style, {
      flex: '1',
      padding: '0.55rem 0',
      fontSize: '0.95rem',
      fontWeight: '600',
      background: 'rgba(255,255,255,0.12)',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.22)',
      borderRadius: '7px',
      cursor: 'pointer',
    })
    playBtn.textContent = 'Play'

    const launch = () => {
      backdrop.remove()
      this.onStartGame?.({ value: hashString(input.value || '0') })
    }
    playBtn.addEventListener('click', launch)
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') launch() })

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove() })

    buttons.appendChild(cancelBtn)
    buttons.appendChild(playBtn)
    modal.appendChild(heading)
    modal.appendChild(input)
    modal.appendChild(buttons)
    backdrop.appendChild(modal)
    document.body.appendChild(backdrop)

    setTimeout(() => input.focus(), 0)
  }
}
