import { createElement, DollarSign, Star, Clock } from 'lucide'
import type { GameState } from '../../../model/types/GameState'

export class HudPanel {
  private el: HTMLElement | null = null

  mount(container: HTMLElement): void {
    const div = document.createElement('div')
    Object.assign(div.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      height: '48px',
      background: 'rgba(20,20,28,0.92)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(255,255,255,0.12)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 1rem',
      color: '#fff',
      zIndex: '15',
      boxSizing: 'border-box',
    })
    this.el = div
    container.appendChild(div)
  }

  update(gameState: GameState, traveltimeUsed: number): void {
    if (!this.el) return
    this.el.innerHTML = ''

    const left = document.createElement('div')
    Object.assign(left.style, { display: 'flex', alignItems: 'center', gap: '1.25rem' })

    left.appendChild(this.makeBadge(createElement(DollarSign, { width: 14, height: 14 }), String(gameState.money)))
    left.appendChild(this.makeBadge(createElement(Star, { width: 14, height: 14 }), String(gameState.stamps)))

    const right = document.createElement('div')
    Object.assign(right.style, { display: 'flex', alignItems: 'center', gap: '0.4rem' })
    right.appendChild(createElement(Clock, { width: 14, height: 14 }))
    const ttText = document.createElement('span')
    Object.assign(ttText.style, { fontSize: '13px', fontVariantNumeric: 'tabular-nums' })
    ttText.textContent = `${traveltimeUsed} / ${gameState.traveltimeBudget}`
    const overBudget = traveltimeUsed > gameState.traveltimeBudget
    ttText.style.color = overBudget ? '#ff6b6b' : '#fff'
    right.appendChild(ttText)

    this.el.appendChild(left)
    this.el.appendChild(right)
  }

  private makeBadge(icon: SVGElement, value: string): HTMLElement {
    const wrap = document.createElement('div')
    Object.assign(wrap.style, { display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '13px' })
    wrap.appendChild(icon)
    const span = document.createElement('span')
    span.textContent = value
    wrap.appendChild(span)
    return wrap
  }
}
