export function buildHoldButton(label: string, durationMs: number, onActivate: () => void): HTMLElement {
  const btn = document.createElement('button')
  Object.assign(btn.style, {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    padding: '0.4rem 0.75rem',
    fontSize: '11px',
    fontWeight: '500',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    cursor: 'pointer',
    letterSpacing: '0.03em',
    userSelect: 'none',
    textAlign: 'center',
  })

  const fill = document.createElement('div')
  Object.assign(fill.style, {
    position: 'absolute',
    inset: '0',
    width: '0%',
    background: 'rgba(255,255,255,0.12)',
    transition: 'none',
    pointerEvents: 'none',
  })

  const labelEl = document.createElement('span')
  Object.assign(labelEl.style, { position: 'relative', zIndex: '1' })
  labelEl.textContent = label

  btn.appendChild(fill)
  btn.appendChild(labelEl)

  let startTime: number | null = null
  let rafId: number | null = null

  const reset = () => {
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
    startTime = null
    fill.style.transition = 'none'
    fill.style.width = '0%'
  }

  const tick = (now: number) => {
    if (startTime === null) return
    const elapsed = now - startTime
    const pct = Math.min(1, elapsed / durationMs)
    fill.style.width = `${pct * 100}%`
    if (pct >= 1) {
      reset()
      onActivate()
    } else {
      rafId = requestAnimationFrame(tick)
    }
  }

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    startTime = performance.now()
    rafId = requestAnimationFrame(tick)
  })
  btn.addEventListener('pointerup', reset)
  btn.addEventListener('pointerleave', reset)
  btn.addEventListener('pointercancel', reset)

  return btn
}
