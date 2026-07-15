import type { Screen } from '../shell/Router'
import { KeyboardUI } from '../keyboard/KeyboardUI'
import { NavOverlay } from '../shell/NavOverlay'

export class KeyboardScreen implements Screen {
  private keyboard: KeyboardUI | null = null
  private menuBtn: HTMLElement | null = null
  private clickHandler: (() => void) | null = null

  mount(container: HTMLElement): void {
    this.keyboard = new KeyboardUI()
    this.keyboard.mount(container)

    // Botão flutuante de menu (100×100px, dwell-target)
    this.menuBtn = document.createElement('button')
    this.menuBtn.className = 'dwell-target floating-menu-btn'
    this.menuBtn.dataset['key'] = 'nav:home'
    this.menuBtn.setAttribute('aria-label', 'Voltar ao início')
    this.menuBtn.innerHTML = `<div class="dwell-fill"></div><span>⊙</span>`
    container.appendChild(this.menuBtn)

    this.clickHandler = () => NavOverlay.toggle()
    this.menuBtn.addEventListener('click', this.clickHandler)
    this.injectStyles()
  }

  unmount(): void {
    if (this.menuBtn && this.clickHandler) {
      this.menuBtn.removeEventListener('click', this.clickHandler)
    }
    this.menuBtn = null
    this.keyboard = null
    this.clickHandler = null
  }

  private injectStyles(): void {
    if (document.getElementById('keyboard-screen-styles')) return
    const style = document.createElement('style')
    style.id = 'keyboard-screen-styles'
    style.textContent = `
      .floating-menu-btn {
        position: fixed; bottom: 24px; right: 80px;
        width: 100px; height: 100px;
        background: rgba(0,255,247,0.1);
        border: 2px solid rgba(0,255,247,0.4);
        border-radius: 16px; color: #00fff7;
        display: flex; align-items: center; justify-content: center;
        font-size: 32px; cursor: pointer; z-index: 200;
        overflow: hidden; transition: border-color 0.15s, background 0.15s;
        font-family: inherit;
      }
      .floating-menu-btn:hover, .floating-menu-btn.dwelling {
        border-color: #fff; background: rgba(0,255,247,0.2);
      }
      .floating-menu-btn .dwell-fill {
        position: absolute; inset: 0;
        background: rgba(0,255,247,0.2);
        transform: scaleX(0); transform-origin: left;
      }
      .floating-menu-btn.dwelling .dwell-fill {
        animation: dwell-progress 0.5s linear forwards;
      }
    `
    document.head.appendChild(style)
  }
}
