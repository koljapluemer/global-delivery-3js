import type { GameSeed } from '../../../model/types/GameSeed'

function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function dailySeed(): number {
  return Math.floor(Date.now() / 86400000)
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

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

export class MainMenuScreen {
  onStartGame: ((seed: GameSeed) => void) | null = null

  private el: HTMLElement | null = null
  private seedInput: HTMLInputElement | null = null
  private seedCheckbox: HTMLInputElement | null = null

  mount(container: HTMLElement): void {
    const div = document.createElement('div')
    Object.assign(div.style, SCREEN_STYLE)

    div.appendChild(this.buildTitle())
    div.appendChild(this.buildStartButton())
    div.appendChild(this.buildDailyButton())
    div.appendChild(this.buildSeedSection())

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

  private buildStartButton(): HTMLButtonElement {
    const btn = document.createElement('button')
    Object.assign(btn.style, BUTTON_STYLE)
    btn.textContent = 'Start Game'
    btn.addEventListener('click', () => this.handleStartGame())
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.2)' })
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.12)' })
    return btn
  }

  private buildDailyButton(): HTMLButtonElement {
    const btn = document.createElement('button')
    Object.assign(btn.style, SECONDARY_BUTTON_STYLE)
    btn.textContent = 'Daily Challenge'
    btn.addEventListener('click', () => this.onStartGame?.({ value: dailySeed(), autoPlace: true }))
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.15)' })
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.08)' })
    return btn
  }

  private buildSeedSection(): HTMLDivElement {
    const section = document.createElement('div')
    Object.assign(section.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '0.5rem',
    })

    const label = document.createElement('label')
    Object.assign(label.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '0.9rem',
      color: '#aaa',
      cursor: 'pointer',
    })

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    this.seedCheckbox = checkbox

    const labelText = document.createElement('span')
    labelText.textContent = 'Seeded Game'

    label.appendChild(checkbox)
    label.appendChild(labelText)

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Enter seed (text or number)'
    Object.assign(input.style, {
      display: 'none',
      padding: '0.4rem 0.75rem',
      fontSize: '0.9rem',
      background: 'rgba(255,255,255,0.1)',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '6px',
      width: '220px',
      textAlign: 'center',
    })
    this.seedInput = input

    checkbox.addEventListener('change', () => {
      input.style.display = checkbox.checked ? 'block' : 'none'
    })

    section.appendChild(label)
    section.appendChild(input)
    return section
  }

  private handleStartGame(): void {
    const seeded = this.seedCheckbox?.checked ?? false
    const raw = this.seedInput?.value ?? ''
    const value = seeded ? hashString(raw || '0') : randomSeed()
    this.onStartGame?.({ value })
  }
}
