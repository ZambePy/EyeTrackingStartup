import type { Screen } from '../shell/Router'
import { NavOverlay } from '../shell/NavOverlay'
import { GazeEngine } from '../gaze/GazeEngine'
import * as calibration from '../calibration'

const PROFILES_KEY = 'irisflow-profiles'
const ACTIVE_KEY   = 'irisflow-active-profile'

interface Profile { id: string; name: string }

function getActiveProfileName(): string {
  try {
    const activeId = localStorage.getItem(ACTIVE_KEY)
    if (!activeId) return 'Sem perfil'
    const raw = localStorage.getItem(PROFILES_KEY)
    if (!raw) return 'Sem perfil'
    const profiles = JSON.parse(raw) as Profile[]
    return profiles.find(p => p.id === activeId)?.name ?? 'Sem perfil'
  } catch { return 'Sem perfil' }
}

export class HomeScreen implements Screen {
  private el: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private cameraTimeoutId: ReturnType<typeof setTimeout> | null = null

  // Rastreamento de câmera e FPS via GazeEngine
  private lastGazeTime  = 0
  private frameCount    = 0
  private fpsLastMark   = 0
  private currentFps    = 0
  private cameraActive  = false
  private cameraChecked = false // após 8s sem eventos, sinaliza erro

  private readonly onGazeMove = (_x: number, _y: number) => {
    const now = performance.now()
    if (!this.cameraActive) {
      this.cameraActive  = true
      this.cameraChecked = true
      this.fpsLastMark   = now
      this.frameCount    = 0
      if (this.cameraTimeoutId) { clearTimeout(this.cameraTimeoutId); this.cameraTimeoutId = null }
      this.render()
    }
    this.frameCount++
    this.lastGazeTime = now
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  mount(container: HTMLElement): void {
    this.injectStyles()

    this.el = document.createElement('div')
    this.el.id = 'home-screen'
    this.el.className = 'hs-root'
    container.appendChild(this.el)

    // Reseta estado de câmera a cada montagem
    this.cameraActive  = false
    this.cameraChecked = false
    this.frameCount    = 0
    this.fpsLastMark   = performance.now()
    this.currentFps    = 0
    this.lastGazeTime  = 0

    GazeEngine.on('gazeMove', this.onGazeMove)

    // Timeout: se em 8s nenhum gazeMove chegar, assume câmera com problema
    this.cameraTimeoutId = setTimeout(() => {
      if (!this.cameraActive) {
        this.cameraChecked = true
        this.render()
      }
    }, 8000)

    // Atualiza status bar a cada segundo
    this.tickInterval = setInterval(() => this.tick(), 1000)

    this.render()
  }

  unmount(): void {
    GazeEngine.off('gazeMove', this.onGazeMove)
    if (this.tickInterval)    clearInterval(this.tickInterval)
    if (this.cameraTimeoutId) clearTimeout(this.cameraTimeoutId)
    this.tickInterval    = null
    this.cameraTimeoutId = null
    this.el?.remove()
    this.el = null
    this.styleEl?.remove()
    this.styleEl = null
  }

  // ── Tick 1s — atualiza FPS e status bar ──────────────────────────────────

  private tick(): void {
    const now = performance.now()
    const elapsed = now - this.fpsLastMark
    if (elapsed > 0) {
      this.currentFps = Math.round((this.frameCount * 1000) / elapsed)
    }
    this.frameCount = 0
    this.fpsLastMark = now

    // Câmera caiu se último evento foi há mais de 3s (e já havia chegado antes)
    if (this.cameraActive && this.lastGazeTime > 0) {
      const stale = (now - this.lastGazeTime) > 3000
      if (stale !== !this.cameraActive) {
        this.cameraActive = !stale
      }
    }

    this.updateStatusBar()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(): void {
    if (!this.el) return

    // Câmera com problema — tela de erro dedicada
    if (this.cameraChecked && !this.cameraActive) {
      this.renderCameraError()
      return
    }

    const isCalib = calibration.isCalibrated()

    this.el.innerHTML = `
      ${!isCalib ? `
        <div class="hs-banner" role="alert" aria-live="polite">
          ⚠&nbsp;&nbsp;Calibração necessária — peça ao cuidador para calibrar o sistema
        </div>
      ` : ''}

      <div class="hs-body">
        <div class="hs-logo" aria-label="IrisFlow">
          <span class="hs-logo-text">IrisFlow</span>
          <span class="hs-logo-dot"></span>
        </div>

        <div class="hs-actions" role="main">
          <button
            class="dwell-target hs-btn"
            data-key="nav:keyboard"
            aria-label="Abrir Teclado Virtual"
          >
            <div class="dwell-fill"></div>
            <span class="key-content hs-btn-inner">
              <span class="hs-btn-icon" aria-hidden="true">
                <svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="54">
                  <rect x="2" y="2" width="60" height="44" rx="6" stroke="currentColor" stroke-width="3"/>
                  <rect x="9"  y="10" width="8" height="6" rx="2" fill="currentColor" opacity=".7"/>
                  <rect x="21" y="10" width="8" height="6" rx="2" fill="currentColor" opacity=".7"/>
                  <rect x="33" y="10" width="8" height="6" rx="2" fill="currentColor" opacity=".7"/>
                  <rect x="45" y="10" width="8" height="6" rx="2" fill="currentColor" opacity=".7"/>
                  <rect x="9"  y="21" width="8" height="6" rx="2" fill="currentColor" opacity=".7"/>
                  <rect x="21" y="21" width="8" height="6" rx="2" fill="currentColor" opacity=".7"/>
                  <rect x="33" y="21" width="8" height="6" rx="2" fill="currentColor" opacity=".7"/>
                  <rect x="45" y="21" width="8" height="6" rx="2" fill="currentColor" opacity=".7"/>
                  <rect x="15" y="32" width="34" height="6" rx="2" fill="currentColor" opacity=".9"/>
                </svg>
              </span>
              <span class="hs-btn-label">Teclado Virtual</span>
            </span>
          </button>

          <button
            class="dwell-target hs-btn"
            data-key="nav:quick-phrases"
            aria-label="Abrir Frases Rápidas"
          >
            <div class="dwell-fill"></div>
            <span class="key-content hs-btn-inner">
              <span class="hs-btn-icon" aria-hidden="true">
                <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="66" height="66">
                  <path d="M8 8h48a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H22L8 60V46H8A4 4 0 0 1 4 42V12a4 4 0 0 1 4-4Z"
                        stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
                  <rect x="16" y="22" width="32" height="4" rx="2" fill="currentColor" opacity=".7"/>
                  <rect x="16" y="32" width="22" height="4" rx="2" fill="currentColor" opacity=".5"/>
                </svg>
              </span>
              <span class="hs-btn-label">Frases Rápidas</span>
            </span>
          </button>
        </div>
      </div>

      <!-- Botão NavOverlay — dwell-target para o usuário, canto inferior direito -->
      <button
        class="dwell-target hs-nav-btn"
        data-key="nav:home"
        id="hs-nav-btn"
        aria-label="Abrir menu de navegação"
      >
        <div class="dwell-fill"></div>
        <span class="key-content">☰</span>
      </button>

      <!-- Status bar do rodapé -->
      <div class="hs-statusbar" id="hs-statusbar" role="status" aria-label="Status do sistema">
        ${this.statusBarHTML()}
      </div>
    `

    this.el.querySelector('#hs-nav-btn')?.addEventListener('click', () => NavOverlay.toggle())
  }

  private renderCameraError(): void {
    if (!this.el) return
    this.el.innerHTML = `
      <div class="hs-camera-error">
        <div class="hs-error-icon">📷</div>
        <h2 class="hs-error-title">Câmera não detectada</h2>
        <p class="hs-error-desc">
          O sistema não conseguiu acessar a câmera.<br>
          Verifique a conexão e as permissões do dispositivo.
        </p>
        <ul class="hs-error-steps">
          <li>Certifique-se de que a câmera está conectada ao computador</li>
          <li>Acesse as <strong>Configurações</strong> e selecione o dispositivo correto</li>
          <li>Verifique se outro programa está usando a câmera</li>
          <li>Reinicie o IrisFlow após corrigir o problema</li>
        </ul>
        <p class="hs-error-note">Esta mensagem é apenas para o cuidador.</p>
      </div>
    `
  }

  // ── Status bar (atualização parcial) ─────────────────────────────────────

  private statusBarHTML(): string {
    const isCalib  = calibration.isCalibrated()
    const profName = getActiveProfileName()
    const fps      = this.currentFps

    const camDot  = this.cameraActive
      ? '<span class="hs-dot hs-dot--green" title="Câmera ativa"></span>'
      : '<span class="hs-dot hs-dot--red"   title="Câmera inativa"></span>'

    const calibDot = isCalib
      ? '<span class="hs-dot hs-dot--green" title="Calibrado"></span>'
      : '<span class="hs-dot hs-dot--yellow" title="Não calibrado"></span>'

    return `
      <div class="hs-stat">
        ${camDot}
        <span class="hs-stat-label">Câmera</span>
      </div>
      <div class="hs-stat-sep"></div>
      <div class="hs-stat">
        ${calibDot}
        <span class="hs-stat-label">${isCalib ? 'Calibrado' : 'Não calibrado'}</span>
      </div>
      <div class="hs-stat-sep"></div>
      <div class="hs-stat">
        <span class="hs-stat-label hs-stat--profile">👤 ${this.esc(profName)}</span>
      </div>
      <div class="hs-stat-sep"></div>
      <div class="hs-stat">
        <span class="hs-stat-label hs-stat--fps">${this.cameraActive ? fps + ' fps' : '— fps'}</span>
      </div>
    `
  }

  private updateStatusBar(): void {
    const bar = document.getElementById('hs-statusbar')
    if (bar) bar.innerHTML = this.statusBarHTML()
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  // ── Estilos ───────────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById('hs-styles')) return
    this.styleEl = document.createElement('style')
    this.styleEl.id = 'hs-styles'
    this.styleEl.textContent = `
      /* ── Root ──────────────────────────────────────────────────────── */
      .hs-root {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        background: #0D0D0D; color: #e0e0e0;
        font-family: system-ui, -apple-system, sans-serif;
        animation: hs-fade-in 0.2s ease-out;
        overflow: hidden;
      }
      @keyframes hs-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }

      /* ── Banner de calibração ───────────────────────────────────────── */
      .hs-banner {
        flex: 0 0 auto;
        background: #1a1200;
        border-bottom: 1px solid #ffaa0040;
        color: #ffcc44;
        font-size: 16px;
        font-weight: 500;
        padding: 12px 24px;
        text-align: center;
        user-select: none;
        pointer-events: none;
      }

      /* ── Corpo central ──────────────────────────────────────────────── */
      .hs-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 52px;
        padding: 0 24px;
        min-height: 0;
      }

      /* ── Logo ───────────────────────────────────────────────────────── */
      .hs-logo {
        display: flex;
        align-items: center;
        gap: 12px;
        user-select: none;
      }
      .hs-logo-text {
        font-size: 48px;
        font-weight: 800;
        color: #00fff7;
        letter-spacing: 6px;
        text-shadow: 0 0 32px rgba(0,255,247,0.35);
        line-height: 1;
      }
      .hs-logo-dot {
        width: 10px; height: 10px; border-radius: 50%;
        background: #00fff7;
        box-shadow: 0 0 12px #00fff7;
        animation: hs-pulse 2s ease-in-out infinite;
      }
      @keyframes hs-pulse {
        0%,100% { opacity: 1; transform: scale(1); }
        50%      { opacity: 0.5; transform: scale(0.7); }
      }

      /* ── Botões principais ──────────────────────────────────────────── */
      .hs-actions {
        display: flex;
        gap: 40px;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
      }
      .hs-btn {
        width: 200px; height: 200px;
        background: #111827;
        border: 2px solid #1e3a4a;
        border-radius: 24px;
        color: #e0e0e0;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        position: relative; overflow: hidden;
        transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        font-family: inherit;
      }
      .hs-btn:hover,
      .hs-btn.dwelling {
        border-color: #00fff7;
        background: #0a1a20;
        box-shadow: 0 0 24px rgba(0,255,247,0.12);
      }
      .hs-btn.clicked {
        background: #00fff7 !important;
        color: #060606 !important;
        border-color: #00fff7 !important;
        transform: scale(0.97);
      }
      .hs-btn .dwell-fill {
        position: absolute; inset: 0;
        background: rgba(0,255,247,0.12);
        transform: scaleX(0); transform-origin: left;
        pointer-events: none;
      }
      .hs-btn.dwelling .dwell-fill {
        animation: dwell-progress 500ms linear forwards;
      }
      @keyframes dwell-progress { to { transform: scaleX(1); } }

      .hs-btn-inner {
        display: flex; flex-direction: column;
        align-items: center; gap: 18px;
        pointer-events: none;
      }
      .hs-btn-icon { color: #00fff7; line-height: 1; }
      .hs-btn.clicked .hs-btn-icon { color: #060606; }
      .hs-btn-label {
        font-size: 20px; font-weight: 700;
        letter-spacing: 0.3px;
      }

      /* ── Botão de menu (NavOverlay) — canto inferior direito ────────── */
      .hs-nav-btn {
        position: fixed;
        bottom: 64px; right: 80px;
        width: 100px; height: 100px;
        background: #111827;
        border: 1.5px solid #1e3a4a;
        border-radius: 16px;
        color: #aaa;
        font-size: 28px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        overflow: hidden;
        transition: border-color 0.15s, color 0.15s, background 0.15s;
        font-family: inherit;
        z-index: 100;
      }
      .hs-nav-btn:hover,
      .hs-nav-btn.dwelling {
        border-color: #00fff7; color: #fff; background: #0a1a20;
      }
      .hs-nav-btn.clicked {
        background: #00fff7 !important; color: #060606 !important;
      }
      .hs-nav-btn .dwell-fill {
        position: absolute; inset: 0;
        background: rgba(0,255,247,0.1);
        transform: scaleX(0); transform-origin: left;
        pointer-events: none;
      }
      .hs-nav-btn.dwelling .dwell-fill {
        animation: dwell-progress 500ms linear forwards;
      }

      /* ── Status bar ─────────────────────────────────────────────────── */
      .hs-statusbar {
        flex: 0 0 48px;
        background: #080808;
        border-top: 1px solid #1a1a1a;
        display: flex;
        align-items: center;
        padding: 0 20px;
        gap: 8px;
        font-size: 13px;
        color: #555;
        user-select: none;
      }
      .hs-stat {
        display: flex; align-items: center; gap: 7px;
        white-space: nowrap;
      }
      .hs-stat-label { color: #666; font-size: 13px; }
      .hs-stat--profile { color: #888; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
      .hs-stat--fps { color: #444; font-variant-numeric: tabular-nums; }
      .hs-stat-sep {
        width: 1px; height: 20px;
        background: #1e1e1e; margin: 0 4px;
        flex-shrink: 0;
      }

      /* ── Indicadores ────────────────────────────────────────────────── */
      .hs-dot {
        width: 8px; height: 8px; border-radius: 50%;
        display: inline-block; flex-shrink: 0;
      }
      .hs-dot--green  { background: #00cc66; box-shadow: 0 0 6px #00cc6680; }
      .hs-dot--yellow { background: #ffcc00; box-shadow: 0 0 6px #ffcc0080; }
      .hs-dot--red    { background: #cc3333; box-shadow: 0 0 6px #cc333380; }

      /* ── Tela de erro de câmera ─────────────────────────────────────── */
      .hs-camera-error {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 40px 48px; gap: 20px; text-align: center;
        background: #0D0D0D;
        animation: hs-fade-in 0.25s ease-out;
      }
      .hs-error-icon { font-size: 64px; line-height: 1; opacity: 0.5; }
      .hs-error-title {
        margin: 0; font-size: 28px; font-weight: 700; color: #ff6b6b;
      }
      .hs-error-desc {
        margin: 0; font-size: 17px; color: #888; line-height: 1.6;
      }
      .hs-error-steps {
        margin: 0; padding: 20px 28px;
        background: #141414; border: 1px solid #222; border-radius: 12px;
        text-align: left; list-style: none; display: flex; flex-direction: column; gap: 12px;
        max-width: 480px; width: 100%;
      }
      .hs-error-steps li {
        font-size: 15px; color: #aaa; line-height: 1.5;
        padding-left: 20px; position: relative;
      }
      .hs-error-steps li::before {
        content: '→'; position: absolute; left: 0;
        color: #555; font-weight: 700;
      }
      .hs-error-steps li strong { color: #ccc; }
      .hs-error-note {
        font-size: 13px; color: #444; font-style: italic; margin: 0;
      }
    `
    document.head.appendChild(this.styleEl)
  }
}
