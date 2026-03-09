import type { TileCenter } from '../../controller/layer_0/tile_centers_api'

export class CountryHoverBar {
  private el: HTMLElement | null = null

  mount(container: HTMLElement): void {
    const div = document.createElement('div')
    Object.assign(div.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      right: '0',
      height: '28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(20,20,28,0.75)',
      backdropFilter: 'blur(6px)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      color: 'rgba(255,255,255,0.7)',
      fontSize: '12px',
      letterSpacing: '0.04em',
      zIndex: '12',
      pointerEvents: 'none',
    })
    this.el = div
    container.appendChild(div)
  }

  update(tile: TileCenter | null): void {
    if (!this.el) return
    this.el.textContent = tile?.country_name ?? ''
  }
}
