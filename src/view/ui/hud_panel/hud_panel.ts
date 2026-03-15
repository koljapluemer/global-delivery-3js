import { createElement, DollarSign, Star, Clock, Undo2, Redo2, Download, Heart } from 'lucide'
import type { GameState } from '../../../model/types/GameState'
import { INITIAL_LIVES } from '../../../controller/game_flow/game_flow_machine'

export class HudPanel {
  onUndo: (() => void) | null = null
  onRedo: (() => void) | null = null
  /** Called when the user requests to download derived snapshots as JSON. */
  onDownloadSnapshots: (() => void) | null = null

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

  update(gameState: GameState, traveltimeUsed: number, canUndo: boolean, canRedo: boolean): void {
    if (!this.el) return
    this.el.innerHTML = ''

    // Left side: empty (intentionally blank for potential future use)
    const left = document.createElement('div')
    Object.assign(left.style, { display: 'flex', alignItems: 'center', minWidth: '120px' })

    const center = document.createElement('div')
    Object.assign(center.style, { display: 'flex', alignItems: 'center', gap: '4px' })

    const undoBtn = document.createElement('button')
    undoBtn.title = 'Undo (Ctrl+Z)'
    undoBtn.appendChild(createElement(Undo2, { width: 16, height: 16 }))
    Object.assign(undoBtn.style, {
      background: 'none',
      border: 'none',
      cursor: canUndo ? 'pointer' : 'default',
      color: canUndo ? '#fff' : 'rgba(255,255,255,0.3)',
      padding: '4px',
      lineHeight: '0',
      display: 'flex',
      alignItems: 'center',
    })
    undoBtn.disabled = !canUndo
    undoBtn.addEventListener('click', () => { this.onUndo?.() })

    const redoBtn = document.createElement('button')
    redoBtn.title = 'Redo (Ctrl+Y)'
    redoBtn.appendChild(createElement(Redo2, { width: 16, height: 16 }))
    Object.assign(redoBtn.style, {
      background: 'none',
      border: 'none',
      cursor: canRedo ? 'pointer' : 'default',
      color: canRedo ? '#fff' : 'rgba(255,255,255,0.3)',
      padding: '4px',
      lineHeight: '0',
      display: 'flex',
      alignItems: 'center',
    })
    redoBtn.disabled = !canRedo
    redoBtn.addEventListener('click', () => { this.onRedo?.() })

    const downloadSnapshotsBtn = document.createElement('button')
    downloadSnapshotsBtn.title = 'Download derived snapshots as JSON'
    downloadSnapshotsBtn.appendChild(createElement(Download, { width: 16, height: 16 }))
    Object.assign(downloadSnapshotsBtn.style, {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: '#fff',
      padding: '4px',
      lineHeight: '0',
      display: 'flex',
      alignItems: 'center',
    })
    downloadSnapshotsBtn.addEventListener('click', () => { this.onDownloadSnapshots?.() })

    center.appendChild(undoBtn)
    center.appendChild(redoBtn)
    center.appendChild(downloadSnapshotsBtn)

    // Right side: lives | money | stamps n/goal | travel budget
    const right = document.createElement('div')
    Object.assign(right.style, { display: 'flex', alignItems: 'center', gap: '1.25rem' })

    // Lives: Heart icons (show INITIAL_LIVES total, dim the lost ones)
    const livesWrap = document.createElement('div')
    Object.assign(livesWrap.style, { display: 'flex', alignItems: 'center', gap: '2px' })
    for (let i = 0; i < INITIAL_LIVES; i++) {
      const heartIcon = createElement(Heart, { width: 14, height: 14 })
      const alive = i < gameState.lives
      heartIcon.style.opacity = alive ? '1' : '0.2'
      heartIcon.style.color = alive ? '#ff6b6b' : '#fff'
      livesWrap.appendChild(heartIcon)
    }
    right.appendChild(livesWrap)

    // Money
    right.appendChild(this.makeBadge(createElement(DollarSign, { width: 14, height: 14 }), String(gameState.money)))

    // Stamps n/goal
    const stampsUnderGoal = gameState.stamps < gameState.stampsGoal
    right.appendChild(this.makeBadge(
      createElement(Star, { width: 14, height: 14 }),
      `${gameState.stamps} / ${gameState.stampsGoal}`,
      stampsUnderGoal ? '#ff6b6b' : undefined,
    ))

    // Travel budget
    const ttWrap = document.createElement('div')
    Object.assign(ttWrap.style, { display: 'flex', alignItems: 'center', gap: '0.4rem' })
    ttWrap.appendChild(createElement(Clock, { width: 14, height: 14 }))
    const ttText = document.createElement('span')
    Object.assign(ttText.style, { fontSize: '13px', fontVariantNumeric: 'tabular-nums' })
    ttText.textContent = `${traveltimeUsed} / ${gameState.traveltimeBudget}`
    const overBudget = traveltimeUsed > gameState.traveltimeBudget
    ttText.style.color = overBudget ? '#ff6b6b' : '#fff'
    ttWrap.appendChild(ttText)
    right.appendChild(ttWrap)

    this.el.appendChild(left)
    this.el.appendChild(center)
    this.el.appendChild(right)
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }

  show(): void {
    if (this.el) this.el.style.display = 'flex'
  }

  private makeBadge(icon: SVGElement, value: string, color?: string): HTMLElement {
    const wrap = document.createElement('div')
    Object.assign(wrap.style, { display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '13px' })
    if (color) icon.style.color = color
    wrap.appendChild(icon)
    const span = document.createElement('span')
    span.textContent = value
    if (color) span.style.color = color
    wrap.appendChild(span)
    return wrap
  }
}
