const BOX_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  top: '0.75rem',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: '15',
  background: 'rgba(8,8,14,0.95)',
  border: '1px solid rgba(255,255,255,0.13)',
  borderTop: '3px solid rgba(100,180,255,0.55)',
  borderRadius: '10px',
  color: '#fff',
  padding: '0.9rem 1.1rem 0.8rem',
  maxWidth: '580px',
  minWidth: '340px',
  display: 'none',
  flexDirection: 'column',
  gap: '0.6rem',
  boxShadow: '0 6px 32px rgba(0,0,0,0.6)',
  pointerEvents: 'auto',
  fontFamily: 'inherit',
}

const HEADER_ROW_STYLE: Partial<CSSStyleDeclaration> = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
}

const PROGRESS_BADGE_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '0.7rem',
  fontWeight: '600',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'rgba(100,180,255,0.85)',
  background: 'rgba(100,180,255,0.1)',
  border: '1px solid rgba(100,180,255,0.25)',
  borderRadius: '4px',
  padding: '0.15rem 0.45rem',
  flexShrink: '0',
}

const TITLE_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '0.8rem',
  color: 'rgba(255,255,255,0.35)',
  letterSpacing: '0.03em',
}

const DIVIDER_STYLE: Partial<CSSStyleDeclaration> = {
  height: '1px',
  background: 'rgba(255,255,255,0.07)',
  margin: '0',
}

const INSTRUCTIONS_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '0.88rem',
  lineHeight: '1.55',
  color: 'rgba(255,255,255,0.88)',
  margin: '0',
}

const BUTTON_ROW_STYLE: Partial<CSSStyleDeclaration> = {
  display: 'flex',
  gap: '0.5rem',
  justifyContent: 'flex-end',
  alignItems: 'center',
  paddingTop: '0.1rem',
}

const RESET_BTN_BASE: Partial<CSSStyleDeclaration> = {
  padding: '0.35rem 0.85rem',
  fontSize: '0.82rem',
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.55)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '5px',
  cursor: 'pointer',
  letterSpacing: '0.02em',
}

const NEXT_BTN_ENABLED: Partial<CSSStyleDeclaration> = {
  padding: '0.35rem 1rem',
  fontSize: '0.82rem',
  fontWeight: '600',
  background: 'rgba(80,200,140,0.2)',
  color: 'rgba(140,240,180,0.95)',
  border: '1px solid rgba(80,200,140,0.4)',
  borderRadius: '5px',
  cursor: 'pointer',
  letterSpacing: '0.02em',
}

const NEXT_BTN_DISABLED: Partial<CSSStyleDeclaration> = {
  padding: '0.35rem 1rem',
  fontSize: '0.82rem',
  fontWeight: '600',
  background: 'rgba(255,255,255,0.03)',
  color: 'rgba(255,255,255,0.2)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '5px',
  cursor: 'not-allowed',
  letterSpacing: '0.02em',
}

const INLINE_STYLES = `
  .tut-instructions p { margin: 0 0 0.45em 0; }
  .tut-instructions p:last-child { margin-bottom: 0; }
  .tut-instructions ol { margin: 0.3em 0 0; padding-left: 1.35em; }
  .tut-instructions li { margin-bottom: 0.3em; color: rgba(255,255,255,0.82); }
  .tut-instructions li:last-child { margin-bottom: 0; }
  .tut-instructions .intro { color: rgba(255,255,255,0.6); margin-bottom: 0.5em; }
`

function ensureInlineStyles(): void {
  if (document.getElementById('tut-inline-styles')) return
  const style = document.createElement('style')
  style.id = 'tut-inline-styles'
  style.textContent = INLINE_STYLES
  document.head.appendChild(style)
}

export class TutorialInstructionBox {
  onNext: (() => void) | null = null
  onReset: (() => void) | null = null

  private el: HTMLElement | null = null
  private progressEl: HTMLElement | null = null
  private instructionsEl: HTMLElement | null = null
  private nextBtn: HTMLButtonElement | null = null
  private container: HTMLElement | null = null

  mount(container: HTMLElement): void {
    this.container = container
    ensureInlineStyles()

    const box = document.createElement('div')
    Object.assign(box.style, BOX_STYLE)

    // Header row: progress badge + label
    const headerRow = document.createElement('div')
    Object.assign(headerRow.style, HEADER_ROW_STYLE)

    const progressBadge = document.createElement('span')
    Object.assign(progressBadge.style, PROGRESS_BADGE_STYLE)
    headerRow.appendChild(progressBadge)
    this.progressEl = progressBadge

    const title = document.createElement('span')
    Object.assign(title.style, TITLE_STYLE)
    title.textContent = 'Tutorial'
    headerRow.appendChild(title)

    box.appendChild(headerRow)

    // Divider
    const divider = document.createElement('div')
    Object.assign(divider.style, DIVIDER_STYLE)
    box.appendChild(divider)

    // Instructions content
    const instructions = document.createElement('div')
    instructions.className = 'tut-instructions'
    Object.assign(instructions.style, INSTRUCTIONS_STYLE)
    box.appendChild(instructions)
    this.instructionsEl = instructions

    // Button row
    const buttonRow = document.createElement('div')
    Object.assign(buttonRow.style, BUTTON_ROW_STYLE)

    const resetBtn = document.createElement('button')
    Object.assign(resetBtn.style, RESET_BTN_BASE)
    resetBtn.textContent = 'Reset'
    resetBtn.addEventListener('click', () => this.onReset?.())
    resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'rgba(255,255,255,0.11)' })
    resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'rgba(255,255,255,0.06)' })

    const nextBtn = document.createElement('button')
    Object.assign(nextBtn.style, NEXT_BTN_DISABLED)
    nextBtn.textContent = 'Next →'
    nextBtn.disabled = true
    nextBtn.addEventListener('click', () => { if (!nextBtn.disabled) this.onNext?.() })
    this.nextBtn = nextBtn

    buttonRow.appendChild(resetBtn)
    buttonRow.appendChild(nextBtn)
    box.appendChild(buttonRow)

    this.el = box
    container.appendChild(box)
  }

  unmount(): void {
    if (this.el && this.container) {
      this.container.removeChild(this.el)
      this.el = null
    }
  }

  show(slideIndex: number, total: number): void {
    if (!this.el) return
    if (this.progressEl) this.progressEl.textContent = `Step ${slideIndex + 1} / ${total}`
    this.el.style.display = 'flex'
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }

  /** Accepts an HTML string for rich formatting (paragraphs, ordered lists). */
  setInstructions(html: string): void {
    if (this.instructionsEl) this.instructionsEl.innerHTML = html
  }

  setNextEnabled(enabled: boolean): void {
    const btn = this.nextBtn
    if (!btn) return
    btn.disabled = !enabled
    Object.assign(btn.style, enabled ? NEXT_BTN_ENABLED : NEXT_BTN_DISABLED)
  }
}
