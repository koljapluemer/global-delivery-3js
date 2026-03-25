export interface VehicleSetupResult {
  name: string
  hue: number
}

const OVERLAY_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  inset: '0',
  background: 'rgba(0,0,0,0.6)',
  zIndex: '200',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const DIALOG_STYLE: Partial<CSSStyleDeclaration> = {
  background: 'rgba(20,22,32,0.98)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '12px',
  padding: '1.8rem 2rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.2rem',
  color: '#fff',
  minWidth: '260px',
}

const TITLE_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '1.1rem',
  fontWeight: '700',
  margin: '0',
  letterSpacing: '0.04em',
}

const LABEL_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '0.85rem',
  fontWeight: '600',
  color: 'rgba(255,255,255,0.7)',
  display: 'block',
  marginBottom: '0.35rem',
}

const INPUT_STYLE: Partial<CSSStyleDeclaration> = {
  width: '100%',
  padding: '0.45rem 0.6rem',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
  outline: 'none',
}

const BUTTON_STYLE: Partial<CSSStyleDeclaration> = {
  padding: '0.55rem 1.4rem',
  fontSize: '0.95rem',
  fontWeight: '600',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: '7px',
  cursor: 'pointer',
}

function hsvToHex(hue: number): string {
  const h = hue / 60
  const f = h - Math.floor(h)
  const p = 0
  const q = Math.round(255 * (1 - f))
  const t = Math.round(255 * f)
  const v = 255
  const i = Math.floor(h) % 6
  const [r, g, b] = [
    [v, t, p, p, q, v],
    [q, v, v, t, p, p],
    [p, p, t, v, v, q],
  ].map((channel) => channel[i])
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** Modal popup shown after vehicle tile placement. Collects name and hue, resolves a Promise. */
export class VehicleSetupPopup {
  private el: HTMLElement | null = null

  mount(container: HTMLElement): void {
    const overlay = document.createElement('div')
    Object.assign(overlay.style, OVERLAY_STYLE)
    overlay.style.display = 'none'
    this.el = overlay
    container.appendChild(overlay)
  }

  show(): Promise<VehicleSetupResult | null> {
    if (!this.el) return Promise.resolve(null)

    const overlay = this.el
    overlay.innerHTML = ''

    return new Promise<VehicleSetupResult | null>((resolve) => {
      const dialog = document.createElement('div')
      Object.assign(dialog.style, DIALOG_STYLE)

      const title = document.createElement('p')
      Object.assign(title.style, TITLE_STYLE)
      title.textContent = 'Name your vehicle'

      // Name field
      const nameGroup = document.createElement('div')
      const nameLabel = document.createElement('label')
      Object.assign(nameLabel.style, LABEL_STYLE)
      nameLabel.textContent = 'Name'
      const nameInput = document.createElement('input')
      Object.assign(nameInput.style, INPUT_STYLE)
      nameInput.type = 'text'
      nameInput.value = 'Vehicle'
      nameInput.maxLength = 24
      nameGroup.appendChild(nameLabel)
      nameGroup.appendChild(nameInput)

      // Hue field
      const hueGroup = document.createElement('div')
      const hueLabel = document.createElement('label')
      Object.assign(hueLabel.style, LABEL_STYLE)
      hueLabel.textContent = 'Color'

      const hueRow = document.createElement('div')
      Object.assign(hueRow.style, { display: 'flex', alignItems: 'center', gap: '0.75rem' })

      const swatch = document.createElement('div')
      Object.assign(swatch.style, {
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.3)',
        flexShrink: '0',
      })

      const hueSlider = document.createElement('input')
      Object.assign(hueSlider.style, { flex: '1', accentColor: '#fff' })
      hueSlider.type = 'range'
      hueSlider.min = '0'
      hueSlider.max = '359'
      hueSlider.value = '60'

      const updateSwatch = (): void => {
        swatch.style.background = hsvToHex(Number(hueSlider.value))
      }
      updateSwatch()
      hueSlider.addEventListener('input', updateSwatch)

      hueRow.appendChild(swatch)
      hueRow.appendChild(hueSlider)
      hueGroup.appendChild(hueLabel)
      hueGroup.appendChild(hueRow)

      // Buttons
      const btnRow = document.createElement('div')
      Object.assign(btnRow.style, { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' })

      const cancelBtn = document.createElement('button')
      Object.assign(cancelBtn.style, BUTTON_STYLE)
      cancelBtn.textContent = 'Cancel'
      cancelBtn.addEventListener('click', () => {
        this.hide()
        resolve(null)
      })

      const confirmBtn = document.createElement('button')
      Object.assign(confirmBtn.style, { ...BUTTON_STYLE, background: 'rgba(100,180,100,0.25)', borderColor: 'rgba(100,220,100,0.4)' })
      confirmBtn.textContent = 'Confirm'
      confirmBtn.addEventListener('click', () => {
        const name = nameInput.value.trim() || 'Vehicle'
        const hue = Number(hueSlider.value)
        this.hide()
        resolve({ name, hue })
      })

      btnRow.appendChild(cancelBtn)
      btnRow.appendChild(confirmBtn)

      dialog.appendChild(title)
      dialog.appendChild(nameGroup)
      dialog.appendChild(hueGroup)
      dialog.appendChild(btnRow)
      overlay.appendChild(dialog)

      overlay.style.display = 'flex'
      nameInput.focus()
      nameInput.select()
    })
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }
}
