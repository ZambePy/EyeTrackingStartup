import type { Screen } from '../shell/Router'

export class QuickPhrasesScreen implements Screen {
  private el: HTMLElement | null = null

  mount(container: HTMLElement): void {
    this.el = document.createElement('div')
    this.el.id = 'quick-phrases-screen-placeholder'
    this.el.innerHTML = `
      <div style="
        display:flex; align-items:center; justify-content:center;
        height:100%; flex-direction:column; gap:16px;
        color:#00fff7; font-size:22px; text-align:center;
      ">
        <div style="font-size:48px">💬</div>
        <div>Frases Rápidas</div>
        <div style="font-size:14px;color:#aaa">Implementada na Sprint UI-5</div>
      </div>
    `
    container.appendChild(this.el)
  }

  unmount(): void {
    this.el?.remove()
    this.el = null
  }
}
