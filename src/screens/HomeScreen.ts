import type { Screen } from '../shell/Router'
import { NavOverlay } from '../shell/NavOverlay'

export class HomeScreen implements Screen {
  private el: HTMLElement | null = null

  mount(container: HTMLElement): void {
    this.el = document.createElement('div')
    this.el.id = 'home-screen'
    this.el.innerHTML = `
      <div class="home-logo">IrisFlow</div>
      <div class="home-actions">
        <button
          class="dwell-target home-btn"
          data-key="nav:keyboard"
          aria-label="Abrir Teclado Virtual"
        >
          <div class="dwell-fill"></div>
          <span class="home-btn-icon">⌨</span>
          <span class="home-btn-label">Teclado</span>
        </button>
        <button
          class="dwell-target home-btn"
          data-key="nav:quick-phrases"
          aria-label="Abrir Frases Rápidas"
        >
          <div class="dwell-fill"></div>
          <span class="home-btn-icon">💬</span>
          <span class="home-btn-label">Frases Rápidas</span>
        </button>
      </div>
      <button
        class="dwell-target home-menu-btn"
        data-key="nav:home"
        id="home-menu-btn"
        aria-label="Abrir menu de navegação"
      >
        <div class="dwell-fill"></div>
        <span>☰</span>
      </button>
    `
    container.appendChild(this.el)
    this.injectStyles()

    document.getElementById('home-menu-btn')?.addEventListener('click', () => {
      NavOverlay.toggle()
    })
  }

  unmount(): void {
    this.el?.remove()
    this.el = null
  }

  private injectStyles(): void {
    if (document.getElementById('home-screen-styles')) return
    const style = document.createElement('style')
    style.id = 'home-screen-styles'
    style.textContent = `
      #home-screen {
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        height: 100%; gap: 48px;
        background: #0D0D0D; color: #fff;
        animation: home-fade-in 0.2s ease-out;
      }
      @keyframes home-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      .home-logo {
        font-size: 52px; font-weight: 700;
        color: #00fff7; letter-spacing: 6px;
        text-shadow: 0 0 30px rgba(0,255,247,0.4);
      }
      .home-actions { display: flex; gap: 32px; }
      .home-btn {
        width: 200px; height: 200px;
        background: #1a1a2e; border: 2px solid #00fff7;
        border-radius: 20px; color: #fff;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 16px; cursor: pointer;
        position: relative; overflow: hidden;
        transition: border-color 0.2s, background 0.2s;
        font-family: inherit;
      }
      .home-btn:hover, .home-btn.dwelling {
        border-color: #fff; background: #0d2137;
      }
      .home-btn.clicked {
        background: #00fff7; color: #0d0d0d;
        transform: scale(0.97);
      }
      .home-btn-icon { font-size: 64px; pointer-events: none; }
      .home-btn-label { font-size: 24px; font-weight: 600; pointer-events: none; }
      .home-btn .dwell-fill {
        position: absolute; inset: 0;
        background: rgba(0,255,247,0.15);
        transform: scaleX(0); transform-origin: left;
      }
      .home-btn.dwelling .dwell-fill {
        animation: dwell-progress 0.5s linear forwards;
      }
      .home-menu-btn {
        position: fixed; bottom: 24px; right: 80px;
        width: 64px; height: 64px;
        background: #1a1a2e; border: 1px solid #333;
        border-radius: 12px; color: #aaa;
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; cursor: pointer;
        overflow: hidden; position: fixed;
        transition: border-color 0.15s, color 0.15s;
        font-family: inherit;
      }
      .home-menu-btn:hover, .home-menu-btn.dwelling {
        border-color: #00fff7; color: #fff;
      }
      .home-menu-btn .dwell-fill {
        position: absolute; inset: 0;
        background: rgba(0,255,247,0.1);
        transform: scaleX(0); transform-origin: left;
      }
      .home-menu-btn.dwelling .dwell-fill {
        animation: dwell-progress 0.5s linear forwards;
      }
    `
    document.head.appendChild(style)
  }
}
