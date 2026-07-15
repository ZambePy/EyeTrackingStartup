import { Router } from './Router'

const CAREGIVER_LINKS = [
  { route: 'calibration', label: 'Calibração', icon: '⊕' },
  { route: 'profile',     label: 'Perfil',      icon: '👤' },
  { route: 'settings',    label: 'Config.',      icon: '⚙' },
  { route: 'phrases',     label: 'Frases',       icon: '📋' },
] as const

class CaregiverNavImpl {
  private el: HTMLElement | null = null
  private collapsed = true

  mount(parent: HTMLElement): void {
    this.el = document.createElement('aside')
    this.el.id = 'caregiver-nav'
    this.el.setAttribute('aria-label', 'Menu do cuidador')

    this.el.innerHTML = `
      <button id="caregiver-toggle" title="Menu cuidador" aria-label="Abrir menu do cuidador">
        <span id="caregiver-toggle-icon">🔒</span>
      </button>
      <nav id="caregiver-links" aria-hidden="true">
        ${CAREGIVER_LINKS.map(
          l => `
          <button class="cg-link" data-route="${l.route}" aria-label="${l.label}">
            <span class="cg-icon">${l.icon}</span>
            <span class="cg-label">${l.label}</span>
          </button>`,
        ).join('')}
      </nav>
    `

    parent.appendChild(this.el)
    this.injectStyles()
    this.bindEvents()
    this.applyCollapsed()
  }

  private bindEvents(): void {
    document.getElementById('caregiver-toggle')?.addEventListener('click', () => {
      this.toggleCollapse()
    })

    this.el!.querySelectorAll<HTMLButtonElement>('.cg-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const route = btn.dataset['route']
        if (route) {
          Router.navigate(route)
          this.collapse()
        }
      })
    })
  }

  private toggleCollapse(): void {
    this.collapsed = !this.collapsed
    this.applyCollapsed()
  }

  collapse(): void {
    this.collapsed = true
    this.applyCollapsed()
  }

  private applyCollapsed(): void {
    if (!this.el) return
    const nav = document.getElementById('caregiver-links')
    const icon = document.getElementById('caregiver-toggle-icon')
    if (this.collapsed) {
      this.el.classList.add('collapsed')
      nav?.setAttribute('aria-hidden', 'true')
      if (icon) icon.textContent = '🔒'
    } else {
      this.el.classList.remove('collapsed')
      nav?.setAttribute('aria-hidden', 'false')
      if (icon) icon.textContent = '✕'
    }
  }

  private injectStyles(): void {
    if (document.getElementById('caregiver-nav-styles')) return
    const style = document.createElement('style')
    style.id = 'caregiver-nav-styles'
    style.textContent = `
      #caregiver-nav {
        position: fixed; top: 0; right: 0; height: 100vh;
        width: 220px; background: #0f0f1a;
        border-left: 1px solid #1e1e2e;
        display: flex; flex-direction: column;
        z-index: 8000; transition: width 0.2s ease;
        overflow: hidden;
      }
      #caregiver-nav.collapsed { width: 48px; }
      #caregiver-toggle {
        width: 48px; height: 48px; min-width: 48px;
        background: transparent; border: none; color: #aaa;
        font-size: 18px; cursor: pointer;
        flex-shrink: 0; align-self: flex-end;
        display: flex; align-items: center; justify-content: center;
        transition: color 0.15s;
      }
      #caregiver-toggle:hover { color: #fff; }
      #caregiver-links {
        display: flex; flex-direction: column; gap: 4px;
        padding: 8px; flex: 1;
      }
      #caregiver-nav.collapsed #caregiver-links { display: none; }
      .cg-link {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 10px; border-radius: 8px;
        background: transparent; border: none;
        color: #ccc; cursor: pointer; text-align: left;
        font-size: 14px; white-space: nowrap;
        transition: background 0.15s, color 0.15s;
        font-family: inherit;
      }
      .cg-link:hover { background: #1a1a2e; color: #fff; }
      .cg-icon { font-size: 18px; flex-shrink: 0; }
      .cg-label { font-size: 14px; }
    `
    document.head.appendChild(style)
  }
}

export const CaregiverNav = new CaregiverNavImpl()
