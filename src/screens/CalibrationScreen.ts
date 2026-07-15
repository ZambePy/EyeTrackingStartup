import type { Screen } from '../shell/Router'

export class CalibrationScreen implements Screen {
  private el: HTMLElement | null = null

  mount(container: HTMLElement): void {
    this.el = document.createElement('div')
    this.el.id = 'calibration-screen-placeholder'
    this.el.innerHTML = `
      <div style="
        display:flex; align-items:center; justify-content:center;
        height:100%; flex-direction:column; gap:16px;
        color:#00fff7; font-size:22px; text-align:center;
      ">
        <div style="font-size:48px">⊕</div>
        <div>Tela de Calibração</div>
        <div style="font-size:14px;color:#aaa">Implementada na Sprint UI-3</div>
        <div style="font-size:13px;color:#666;margin-top:8px">
          Use o painel do cuidador (canto superior direito) para calibrar agora
        </div>
      </div>
    `
    container.appendChild(this.el)
  }

  unmount(): void {
    this.el?.remove()
    this.el = null
  }
}
