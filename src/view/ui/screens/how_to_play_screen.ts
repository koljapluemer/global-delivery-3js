const OVERLAY_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  inset: '0',
  background: 'rgba(6,6,12,0.96)',
  zIndex: '200',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  overflowY: 'auto',
  color: '#fff',
  padding: '2rem 1rem',
}

const CONTENT_STYLE: Partial<CSSStyleDeclaration> = {
  maxWidth: '680px',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '2.5rem',
}

const CLOSE_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'sticky',
  top: '0',
  alignSelf: 'flex-end',
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '8px',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.95rem',
  fontWeight: '600',
  padding: '0.4rem 1.1rem',
  marginBottom: '-1rem',
  zIndex: '1',
}

const SECTION_TITLE_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '1.15rem',
  fontWeight: '700',
  letterSpacing: '0.05em',
  margin: '0 0 0.75rem',
  textTransform: 'uppercase',
  opacity: '0.9',
}

const BODY_TEXT_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '0.95rem',
  lineHeight: '1.65',
  opacity: '0.82',
  margin: '0',
}

const CARD_ROW_STYLE: Partial<CSSStyleDeclaration> = {
  display: 'flex',
  gap: '1rem',
  flexWrap: 'wrap',
}

const CARD_STYLE: Partial<CSSStyleDeclaration> = {
  flex: '1',
  minWidth: '140px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
}

const CARD_ICON_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '1.6rem',
  lineHeight: '1',
}

const CARD_LABEL_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '0.85rem',
  fontWeight: '600',
  opacity: '0.95',
}

const CARD_DESC_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: '0.8rem',
  opacity: '0.6',
  lineHeight: '1.4',
}

const DIVIDER_STYLE: Partial<CSSStyleDeclaration> = {
  border: 'none',
  borderTop: '1px solid rgba(255,255,255,0.07)',
  margin: '0',
}

const KEY_STYLE: Partial<CSSStyleDeclaration> = {
  display: 'inline-block',
  background: 'rgba(255,255,255,0.12)',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: '5px',
  padding: '0.1rem 0.45rem',
  fontSize: '0.82rem',
  fontFamily: 'monospace',
  letterSpacing: '0.03em',
}

function applyStyle(el: HTMLElement, style: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, style)
}

function h(tag: string, style?: Partial<CSSStyleDeclaration>, text?: string): HTMLElement {
  const el = document.createElement(tag)
  if (style) applyStyle(el, style)
  if (text !== undefined) el.textContent = text
  return el
}

function buildSection(title: string, children: HTMLElement[]): HTMLElement {
  const section = h('div')
  section.appendChild(h('h2', SECTION_TITLE_STYLE, title))
  children.forEach((c) => section.appendChild(c))
  return section
}

function buildCard(icon: string, label: string, desc: string): HTMLElement {
  const card = h('div', CARD_STYLE)
  card.appendChild(h('span', CARD_ICON_STYLE, icon))
  card.appendChild(h('span', CARD_LABEL_STYLE, label))
  card.appendChild(h('span', CARD_DESC_STYLE, desc))
  return card
}

function buildKeyRow(keys: string[], description: string): HTMLElement {
  const row = h('div')
  applyStyle(row, {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.45rem 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  })

  const keyWrap = h('div')
  applyStyle(keyWrap, { display: 'flex', gap: '0.3rem', minWidth: '120px', flexShrink: '0' })
  keys.forEach((k) => keyWrap.appendChild(h('span', KEY_STYLE, k)))

  const desc = h('span', { fontSize: '0.875rem', opacity: '0.75' }, description)

  row.appendChild(keyWrap)
  row.appendChild(desc)
  return row
}

function buildGoalSection(): HTMLElement {
  const text = h('p', BODY_TEXT_STYLE,
    'Deliver crates to their destination countries before your budget runs out. ' +
    'Each turn costs a fee — plan your routes efficiently to keep earning more than you spend.',
  )
  const row = h('div', CARD_ROW_STYLE)
  row.appendChild(buildCard('📦', 'Crates', 'Spawned each turn. Each has a destination country.'))
  row.appendChild(buildCard('🚗', 'Cars', 'Move on land. Place on any land tile.'))
  row.appendChild(buildCard('⛵', 'Boats', 'Move on water. Place on any sea tile.'))
  row.appendChild(buildCard('💰', 'Budget', 'Earn by delivering. Spend on travel fees and turn costs.'))
  const section = buildSection('Objective', [text])
  const rowWrap = h('div')
  applyStyle(rowWrap, { marginTop: '1rem' })
  rowWrap.appendChild(row)
  section.appendChild(rowWrap)
  return section
}

function buildTurnSection(): HTMLElement {
  const steps = [
    ['1', 'Plan routes', 'Click a vehicle on the globe, then click destination tiles to build a route.'],
    ['2', 'Load crates', 'Click a crate or a vehicle stop to open the load/unload menu.'],
    ['3', 'End Turn', 'Press End Turn in the sidebar to animate all vehicles and collect rewards.'],
    ['4', 'Repeat', 'New crates arrive each turn. Survive as long as possible.'],
  ]
  const list = h('div')
  applyStyle(list, { display: 'flex', flexDirection: 'column', gap: '0.6rem' })
  steps.forEach(([num, title, desc]) => {
    const item = h('div')
    applyStyle(item, {
      display: 'flex',
      gap: '0.9rem',
      alignItems: 'flex-start',
      background: 'rgba(255,255,255,0.04)',
      borderRadius: '8px',
      padding: '0.65rem 0.85rem',
    })
    const numEl = h('span')
    applyStyle(numEl, {
      fontSize: '0.8rem',
      fontWeight: '700',
      background: 'rgba(255,255,255,0.15)',
      borderRadius: '50%',
      width: '22px',
      height: '22px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
      marginTop: '1px',
    })
    numEl.textContent = num
    const textWrap = h('div')
    const titleEl = h('div', { fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.15rem' }, title)
    const descEl = h('div', { fontSize: '0.82rem', opacity: '0.6', lineHeight: '1.4' }, desc)
    textWrap.appendChild(titleEl)
    textWrap.appendChild(descEl)
    item.appendChild(numEl)
    item.appendChild(textWrap)
    list.appendChild(item)
  })
  return buildSection('Each Turn', [list])
}

function buildControlsSection(): HTMLElement {
  const controls = h('div')
  applyStyle(controls, { display: 'flex', flexDirection: 'column' })
  controls.appendChild(buildKeyRow(['Drag'], 'Rotate the globe'))
  controls.appendChild(buildKeyRow(['Scroll'], 'Zoom in / out'))
  controls.appendChild(buildKeyRow(['Click', 'vehicle'], 'Select and inspect a vehicle'))
  controls.appendChild(buildKeyRow(['Click', 'tile'], 'Add a waypoint to selected vehicle\'s route'))
  controls.appendChild(buildKeyRow(['Click', 'crate'], 'Open load / unload menu'))
  controls.appendChild(buildKeyRow(['Ctrl+Z'], 'Undo last action'))
  controls.appendChild(buildKeyRow(['Ctrl+Y'], 'Redo'))
  return buildSection('Controls', [controls])
}

function buildEconomySection(): HTMLElement {
  const row = h('div', CARD_ROW_STYLE)
  row.appendChild(buildCard('📬', 'Delivery reward', 'Earn timecost budget when a crate reaches its country.'))
  row.appendChild(buildCard('🛣️', 'Travel cost', 'Each tile of movement spends budget.'))
  row.appendChild(buildCard('📅', 'Turn fee', 'A fixed fee (growing each turn) is charged every turn.'))
  row.appendChild(buildCard('🏆', 'Completion bonus', 'Deliver every crate in a turn for a bonus reward.'))
  return buildSection('Economy', [row])
}

export class HowToPlayScreen {
  private el: HTMLElement | null = null

  mount(container: HTMLElement): void {
    const overlay = h('div', OVERLAY_STYLE)
    overlay.style.display = 'none'

    const content = h('div', CONTENT_STYLE)

    const closeBtn = h('button', CLOSE_STYLE, 'Close')
    closeBtn.addEventListener('click', () => this.hide())
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = 'rgba(255,255,255,0.18)' })
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = 'rgba(255,255,255,0.1)' })

    const title = h('h1')
    applyStyle(title, {
      fontSize: '2rem',
      fontWeight: '700',
      letterSpacing: '0.04em',
      margin: '0',
      paddingBottom: '0.5rem',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
    })
    title.textContent = 'How to Play'

    content.appendChild(closeBtn)
    content.appendChild(title)
    content.appendChild(buildGoalSection())
    content.appendChild(h('hr', DIVIDER_STYLE))
    content.appendChild(buildTurnSection())
    content.appendChild(h('hr', DIVIDER_STYLE))
    content.appendChild(buildControlsSection())
    content.appendChild(h('hr', DIVIDER_STYLE))
    content.appendChild(buildEconomySection())

    const bottomClose = h('button', CLOSE_STYLE, 'Close')
    Object.assign(bottomClose.style, { alignSelf: 'center', position: 'static', marginTop: '0.5rem' })
    bottomClose.addEventListener('click', () => this.hide())
    bottomClose.addEventListener('mouseenter', () => { bottomClose.style.background = 'rgba(255,255,255,0.18)' })
    bottomClose.addEventListener('mouseleave', () => { bottomClose.style.background = 'rgba(255,255,255,0.1)' })
    content.appendChild(bottomClose)

    overlay.appendChild(content)
    this.el = overlay
    container.appendChild(overlay)
  }

  show(): void {
    if (this.el) {
      this.el.style.display = 'flex'
      this.el.scrollTop = 0
    }
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }
}
