import type { CardDefinition, CardKind } from '../../../model/types/Card'
import bgUrl from '../../../assets/cards/background_card.svg?url'

export interface CardPickData {
  cards: CardDefinition[]
  prompt: string
}

const SCREEN_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  inset: '0',
  background: 'rgba(10,10,16,0.95)',
  zIndex: '100',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2.5rem',
  color: '#fff',
}

const PROMPT_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '1.4rem',
  fontWeight: '600',
  letterSpacing: '0.04em',
  margin: '0',
}

const CARDS_ROW_STYLE: Partial<CSSStyleDeclaration> = {
  display: 'flex',
  flexDirection: 'row',
  gap: '2rem',
  alignItems: 'flex-end',
}

const CARD_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'relative',
  width: '160px',
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'transform 0.15s ease',
}

const CARD_LABEL_STYLE: Partial<CSSStyleDeclaration> = {
  textAlign: 'center',
  fontSize: '0.9rem',
  fontWeight: '600',
  marginTop: '0.6rem',
  letterSpacing: '0.03em',
}

function buildCardElement(def: CardDefinition, onClick: () => void): HTMLElement {
  const wrapper = document.createElement('div')
  Object.assign(wrapper.style, CARD_STYLE)

  const bg = document.createElement('img')
  bg.src = bgUrl
  bg.style.width = '100%'
  bg.style.display = 'block'

  const icon = document.createElement('img')
  icon.src = def.svgUrl
  Object.assign(icon.style, {
    position: 'absolute',
    top: '15%',
    left: '15%',
    width: '70%',
    height: '55%',
    objectFit: 'contain',
  })

  const label = document.createElement('div')
  Object.assign(label.style, CARD_LABEL_STYLE)
  label.textContent = def.label

  wrapper.appendChild(bg)
  wrapper.appendChild(icon)
  wrapper.appendChild(label)

  wrapper.addEventListener('click', onClick)
  wrapper.addEventListener('mouseenter', () => { wrapper.style.transform = 'translateY(-8px) scale(1.03)' })
  wrapper.addEventListener('mouseleave', () => { wrapper.style.transform = '' })

  return wrapper
}

export class CardPickScreen {
  onCardPicked: ((kind: CardKind) => void) | null = null

  private el: HTMLElement | null = null
  private promptEl: HTMLElement | null = null
  private cardsRow: HTMLElement | null = null

  mount(container: HTMLElement): void {
    const div = document.createElement('div')
    Object.assign(div.style, SCREEN_STYLE)
    div.style.display = 'none'

    const prompt = document.createElement('p')
    Object.assign(prompt.style, PROMPT_STYLE)

    const row = document.createElement('div')
    Object.assign(row.style, CARDS_ROW_STYLE)

    div.appendChild(prompt)
    div.appendChild(row)

    this.el = div
    this.promptEl = prompt
    this.cardsRow = row
    container.appendChild(div)
  }

  show(data: CardPickData): void {
    if (!this.el || !this.promptEl || !this.cardsRow) return

    this.promptEl.textContent = data.prompt

    this.cardsRow.innerHTML = ''
    for (const def of data.cards) {
      const cardEl = buildCardElement(def, () => {
        this.onCardPicked?.(def.kind)
      })
      this.cardsRow.appendChild(cardEl)
    }

    this.el.style.display = 'flex'
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }
}
