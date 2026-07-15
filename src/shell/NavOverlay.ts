import { Router } from './Router'

const ROUTES = [
  { key: 'home',          label: 'Início',        icon: '⊙' },
  { key: 'keyboard',      label: 'Teclado',        icon: '⌨' },
  { key: 'quick-phrases', label: 'Frases',         icon: '💬' },
  { key: 'calibration',   label: 'Calibração',     icon: '⊕' },
] as const

class NavOverlayImpl {
  private el: HTMLElement | null = null
  private visible = false

  mount(parent: HTMLElement): void {
    this.el = document.createElement('div')
    this.el.id = 'nav-overlay'
    this.el.setAttribute('aria-label', 'Menu de navegação')
    this.el.style.display = 'none'

    this.el.innerHTML = `
      <div class="nav-overlay-backdrop"></div>
      <div class="nav-overlay-grid">
        ${ROUTES.map(
          r => `
          <button
            class="dwell-target nav-btn"
            data-key="nav:${r.key}"
            aria-label="Ir para ${r.label}"
          >
            <div class="dwell-fill"></div>
            <span class="nav-btn-icon">${r.icon}</span>
            <span class="nav-btn-label">${r.label}</span>
          </button>`,
        ).join('')}
      </div>
    `

    // Esconde o overlay após navegação bem-sucedida
    Router.onNavigate(() => this.hide())

    parent.appendChild(this.el)
    this.injectStyles()
  }

  toggle(): void {
    this.visible ? this.hide() : this.show()
  }

  show(): void {
    if (!this.el) return
    this.visible = true
    this.el.style.display = 'flex'
  }

  hide(): void {
    if (!this.el) return
    this.visible = false
    this.el.style.display = 'none'
  }

  isVisible(): boolean {
    return this.visible
  }

  private injectStyles(): void {
    if (document.getElementById('nav-overlay-styles')) return
    const style = document.createElement('style')
    style.id = 'nav-overlay-styles'
    style.textContent = `
      #nav-overlay {
        position: fixed; inset: 0; z-index: 9000;
        align-items: center; justify-content: center;
        flex-direction: column; gap: 24px;
      }
      .nav-overlay-backdrop {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.88);
      }
      .nav-overlay-grid {
        position: relative; z-index: 1;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 24px;
      }
      .nav-btn {
        width: 180px; height: 140px; min-width: 120px; min-height: 120px;
        background: #1a1a2e; border: 2px solid #00fff7;
        border-radius: 16px; color: #fff;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 12px; cursor: pointer;
        position: relative; overflow: hidden;
        transition: border-color 0.2s, background 0.2s;
        font-family: inherit;
      }
      .nav-btn:hover, .nav-btn.dwelling {
        border-color: #fff; background: #0d2137;
      }
      .nav-btn.clicked {
        background: #00fff7; color: #0d0d0d;
      }
      .nav-btn-icon { font-size: 36px; pointer-events: none; }
      .nav-btn-label { font-size: 18px; font-weight: 600; pointer-events: none; }
      .nav-btn .dwell-fill {
        position: absolute; inset: 0;
        background: rgba(0,255,247,0.2);
        transform: scaleX(0); transform-origin: left;
      }
      .nav-btn.dwelling .dwell-fill {
        animation: dwell-progress 0.5s linear forwards;
      }
      @keyframes dwell-progress { to { transform: scaleX(1); } }
    `
    document.head.appendChild(style)
  }
}

export const NavOverlay = new NavOverlayImpl()
