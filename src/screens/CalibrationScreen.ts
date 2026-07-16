import type { Screen } from '../shell/Router'
import * as calibration from '../calibration'
import type { AccuracyResult } from '../accuracy'

declare global {
  interface Window {
    irisflow?: {
      saveProfile: (id: string, data: unknown) => Promise<void>
      loadProfile: (id: string) => Promise<unknown>
      savePhrases: (data: unknown) => Promise<void>
      loadPhrases: () => Promise<unknown>
      exportLog: (data: string) => Promise<void>
      getAppVersion: () => Promise<string>
    }
  }
}

type Phase = 'instructions' | 'calibrating' | 'results'

export class CalibrationScreen implements Screen {
  private el: HTMLElement | null = null
  private phase: Phase = 'instructions'
  private lastResult: AccuracyResult | null = null
  private styleEl: HTMLStyleElement | null = null

  private onCalibResult = (e: Event) => {
    this.lastResult = (e as CustomEvent<AccuracyResult>).detail
    this.phase = 'results'
    this.render()
  }

  private onCalibCancelled = () => {
    if (this.phase === 'calibrating') {
      this.phase = 'instructions'
      this.render()
    }
  }

  mount(container: HTMLElement): void {
    this.injectStyles()

    this.el = document.createElement('div')
    this.el.id = 'calibration-screen'
    this.el.className = 'cs-root'
    container.appendChild(this.el)

    window.addEventListener('irisflow:calibrationResult', this.onCalibResult as EventListener)
    window.addEventListener('irisflow:calibrationCancelled', this.onCalibCancelled)

    if (calibration.isCalibrated()) {
      this.lastResult = this.getSavedAccuracyResult()
      this.phase = this.lastResult ? 'results' : 'instructions'
    } else {
      this.phase = 'instructions'
    }

    this.render()
  }

  unmount(): void {
    window.removeEventListener('irisflow:calibrationResult', this.onCalibResult as EventListener)
    window.removeEventListener('irisflow:calibrationCancelled', this.onCalibCancelled)
    this.hideCameraFeed()
    this.el?.remove()
    this.el = null
    this.styleEl?.remove()
    this.styleEl = null
  }

  // ── Feed de câmera ───────────────────────────────────────────────────────────

  private showCameraFeed(): void {
    const video  = document.getElementById('webcam')         as HTMLVideoElement | null
    const canvas = document.getElementById('output_canvas')  as HTMLCanvasElement | null
    if (video)  video.style.display  = 'block'
    if (canvas) canvas.style.display = 'block'
    if (this.el) this.el.style.background = 'transparent'
  }

  private hideCameraFeed(): void {
    const video  = document.getElementById('webcam')         as HTMLVideoElement | null
    const canvas = document.getElementById('output_canvas')  as HTMLCanvasElement | null
    if (video)  video.style.display  = 'none'
    if (canvas) canvas.style.display = 'none'
    if (this.el) this.el.style.background = ''
  }

  private render(): void {
    if (!this.el) return
    switch (this.phase) {
      case 'instructions': this.renderInstructions(); break
      case 'calibrating':  this.renderCalibrating();  break
      case 'results':      this.renderResults();      break
    }
  }

  // ── Fase 1: Instruções ───────────────────────────────────────────────────────

  private renderInstructions(): void {
    if (!this.el) return
    this.showCameraFeed()
    const alreadyCalibrated = calibration.isCalibrated()

    this.el.innerHTML = `
      <div class="cs-phase cs-instructions">
        <div class="cs-header">
          <div class="cs-icon">⊕</div>
          <h1 class="cs-title">Calibração Ocular</h1>
          <p class="cs-subtitle">Processo guiado de calibração para rastreamento ocular preciso</p>
        </div>

        <div class="cs-steps">
          <div class="cs-step">
            <span class="cs-step-num">1</span>
            <span class="cs-step-text">Instrua o usuário a sentar confortavelmente, a <strong>~60cm</strong> da tela</span>
          </div>
          <div class="cs-step">
            <span class="cs-step-num">2</span>
            <span class="cs-step-text">Garanta <strong>boa iluminação frontal</strong> — evite luz forte atrás do usuário</span>
          </div>
          <div class="cs-step">
            <span class="cs-step-num">3</span>
            <span class="cs-step-text">Peça ao usuário para <strong>olhar fixamente</strong> para cada ponto, sem piscar</span>
          </div>
          <div class="cs-step">
            <span class="cs-step-num">4</span>
            <span class="cs-step-text">Clique em <strong>Iniciar Calibração</strong> e acompanhe as duas fases do processo</span>
          </div>
        </div>

        <div class="cs-status-row">
          ${alreadyCalibrated
            ? '<span class="cs-badge cs-badge-ok">✓ Calibração anterior disponível</span>'
            : '<span class="cs-badge cs-badge-warn">⚠ Dispositivo não calibrado</span>'
          }
        </div>

        <div class="cs-actions">
          <button id="cs-btn-start" class="cs-btn cs-btn-primary">
            Iniciar Calibração
          </button>
          <button id="cs-btn-back" class="cs-btn cs-btn-secondary">
            Voltar para Home
          </button>
        </div>

        <p class="cs-privacy">🔒 Todo processamento ocorre localmente. Nenhum dado de vídeo ou olhar é transmitido.</p>
      </div>
    `

    this.el.querySelector('#cs-btn-start')?.addEventListener('click', () => {
      this.phase = 'calibrating'
      this.render()
      setTimeout(() => calibration.startPreCalibration(), 150)
    })

    this.el.querySelector('#cs-btn-back')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('irisflow:navigate', { detail: { route: 'home' } }))
    })
  }

  // ── Fase 2: Calibração em andamento ─────────────────────────────────────────

  private renderCalibrating(): void {
    if (!this.el) return
    this.showCameraFeed()

    this.el.innerHTML = `
      <div class="cs-phase cs-calibrating">
        <div class="cs-spinner-wrap">
          <div class="cs-spinner"></div>
        </div>
        <h2 class="cs-title">Calibração em andamento…</h2>
        <p class="cs-subtitle">
          Acompanhe as instruções na tela e guie o usuário durante o processo.<br>
          O processo possui <strong>duas fases</strong> e dura aproximadamente 2 minutos.
        </p>
        <div class="cs-phase-badges">
          <span class="cs-phase-badge">Fase 1: 9 pontos estáticos</span>
          <span class="cs-phase-sep">→</span>
          <span class="cs-phase-badge">Fase 2: trajetória dinâmica</span>
        </div>
        <p class="cs-calibrating-hint">
          Para interromper, clique em <strong>Cancelar</strong> no painel de calibração.
        </p>
      </div>
    `
  }

  // ── Fase 3: Resultados ───────────────────────────────────────────────────────

  private renderResults(): void {
    if (!this.el) return
    this.hideCameraFeed()
    const r = this.lastResult

    const scoreHtml = r ? `
      <div class="cs-score ${r.colorClass}">${r.score}</div>
      <div class="cs-metrics">
        <div class="cs-metric">
          <div class="cs-metric-label">Erro médio</div>
          <div class="cs-metric-value">${Math.round(r.meanError)}px</div>
        </div>
        <div class="cs-metric">
          <div class="cs-metric-label">Erro máximo</div>
          <div class="cs-metric-value">${Math.round(r.maxError)}px</div>
        </div>
        ${r.meanErrorDeg !== undefined ? `
        <div class="cs-metric">
          <div class="cs-metric-label">Erro angular</div>
          <div class="cs-metric-value">${r.meanErrorDeg.toFixed(2)}°</div>
        </div>
        ` : ''}
        <div class="cs-metric">
          <div class="cs-metric-label">Pontos válidos</div>
          <div class="cs-metric-value">${r.validPointCount}/9</div>
        </div>
        <div class="cs-metric">
          <div class="cs-metric-label">Precisão RMS</div>
          <div class="cs-metric-value">${r.meanPrecision !== undefined ? Math.round(r.meanPrecision) + 'px' : '—'}</div>
        </div>
        ${r.estimatedDistanceCm ? `
        <div class="cs-metric">
          <div class="cs-metric-label">Distância estimada</div>
          <div class="cs-metric-value">${Math.round(r.estimatedDistanceCm)}cm</div>
        </div>
        ` : ''}
      </div>
    ` : `
      <div class="cs-no-result">
        Calibração concluída. Resultado de precisão não disponível nesta sessão.
      </div>
    `

    this.el.innerHTML = `
      <div class="cs-phase cs-results">
        <div class="cs-results-header">
          <div class="cs-check-icon">✓</div>
          <h1 class="cs-title">Calibração Concluída</h1>
          <p class="cs-subtitle">Revise o relatório de precisão abaixo antes de continuar</p>
        </div>

        <div class="cs-accuracy-card">
          ${scoreHtml}
        </div>

        <div class="cs-results-actions">
          <button id="cs-btn-accept" class="cs-btn cs-btn-primary">
            Aceitar e Continuar
          </button>
          <button id="cs-btn-recalib" class="cs-btn cs-btn-secondary">
            Recalibrar
          </button>
        </div>
      </div>
    `

    this.el.querySelector('#cs-btn-accept')?.addEventListener('click', async () => {
      await this.saveProfileViaIPC()
      document.dispatchEvent(new CustomEvent('irisflow:navigate', { detail: { route: 'home' } }))
    })

    this.el.querySelector('#cs-btn-recalib')?.addEventListener('click', () => {
      calibration.clearCalibration()
      this.lastResult = null
      this.phase = 'calibrating'
      this.render()
      setTimeout(() => calibration.startPreCalibration(), 150)
    })
  }

  // ── Persistência via IPC ─────────────────────────────────────────────────────

  private async saveProfileViaIPC(): Promise<void> {
    try {
      if (window.irisflow?.saveProfile) {
        const raw = localStorage.getItem('calibrationProfile')
        if (raw) {
          await window.irisflow.saveProfile('default', JSON.parse(raw))
          console.info('[IrisFlow S3] Perfil salvo via IPC em arquivo local')
        }
      }
    } catch (e) {
      console.warn('[IrisFlow S3] IPC indisponível (modo web?); perfil persiste em localStorage:', e)
    }
  }

  // ── Utilitários ──────────────────────────────────────────────────────────────

  private getSavedAccuracyResult(): AccuracyResult | null {
    try {
      const saved = localStorage.getItem('accuracyResult')
      return saved ? JSON.parse(saved) as AccuracyResult : null
    } catch { return null }
  }

  // ── Estilos ──────────────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById('cs-styles')) return
    this.styleEl = document.createElement('style')
    this.styleEl.id = 'cs-styles'
    this.styleEl.textContent = `
      .cs-root {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        width: 100%;
        background: #0D0D0D;
        color: #e0e0e0;
        font-family: system-ui, -apple-system, sans-serif;
        overflow-y: auto;
        padding: 24px 0;
        box-sizing: border-box;
      }

      .cs-phase {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 640px;
        padding: 0 32px;
        box-sizing: border-box;
        gap: 28px;
      }

      /* Instruções: card flutuante sobre o feed de câmera */
      .cs-instructions {
        background: rgba(10, 10, 20, 0.82);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 20px;
        padding: 36px 32px;
        max-width: 560px;
      }

      /* ── Header ─────────────────────────────────────────────── */
      .cs-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        text-align: center;
      }

      .cs-icon {
        font-size: 52px;
        color: #00fff7;
        line-height: 1;
        filter: drop-shadow(0 0 12px #00fff740);
      }

      .cs-title {
        margin: 0;
        font-size: 28px;
        font-weight: 700;
        color: #ffffff;
        letter-spacing: -0.3px;
      }

      .cs-subtitle {
        margin: 0;
        font-size: 16px;
        color: #999;
        text-align: center;
        line-height: 1.5;
      }

      /* ── Steps (instruções) ─────────────────────────────────── */
      .cs-steps {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
        background: #161616;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 20px 24px;
        box-sizing: border-box;
      }

      .cs-step {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        font-size: 16px;
        line-height: 1.5;
        color: #ccc;
      }

      .cs-step-num {
        min-width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #00fff715;
        border: 1.5px solid #00fff750;
        color: #00fff7;
        font-size: 13px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 1px;
      }

      .cs-step strong {
        color: #e0e0e0;
      }

      /* ── Status badge ───────────────────────────────────────── */
      .cs-status-row {
        display: flex;
        justify-content: center;
      }

      .cs-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 600;
      }

      .cs-badge-ok {
        background: #00ff6615;
        border: 1px solid #00ff6650;
        color: #00ff88;
      }

      .cs-badge-warn {
        background: #ffaa0015;
        border: 1px solid #ffaa0050;
        color: #ffbb33;
      }

      /* ── Actions ────────────────────────────────────────────── */
      .cs-actions,
      .cs-results-actions {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
      }

      .cs-btn {
        width: 100%;
        padding: 14px 24px;
        border: none;
        border-radius: 10px;
        font-size: 18px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.1s;
        letter-spacing: 0.2px;
      }

      .cs-btn:hover {
        opacity: 0.88;
        transform: translateY(-1px);
      }

      .cs-btn:active {
        transform: translateY(0);
        opacity: 0.75;
      }

      .cs-btn-primary {
        background: #00fff7;
        color: #0a0a0a;
      }

      .cs-btn-secondary {
        background: #1e1e1e;
        color: #ccc;
        border: 1px solid #333;
      }

      /* ── Privacy note ───────────────────────────────────────── */
      .cs-privacy {
        margin: 0;
        font-size: 12px;
        color: #555;
        text-align: center;
      }

      /* ── Calibrating phase ──────────────────────────────────── */
      .cs-calibrating {
        text-align: center;
        gap: 20px;
      }

      .cs-spinner-wrap {
        margin-bottom: 8px;
      }

      .cs-spinner {
        width: 64px;
        height: 64px;
        border: 4px solid #1e1e1e;
        border-top-color: #00fff7;
        border-radius: 50%;
        animation: cs-spin 1s linear infinite;
        margin: 0 auto;
      }

      @keyframes cs-spin {
        to { transform: rotate(360deg); }
      }

      .cs-phase-badges {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: center;
      }

      .cs-phase-badge {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        color: #aaa;
        font-size: 13px;
        padding: 5px 12px;
        border-radius: 20px;
      }

      .cs-phase-sep {
        color: #444;
        font-size: 16px;
      }

      .cs-calibrating-hint {
        margin: 0;
        font-size: 14px;
        color: #555;
      }

      /* ── Results phase ──────────────────────────────────────── */
      .cs-results-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        text-align: center;
      }

      .cs-check-icon {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: #00ff6620;
        border: 2.5px solid #00ff66;
        color: #00ff88;
        font-size: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 0 10px #00ff6640);
      }

      .cs-accuracy-card {
        width: 100%;
        background: #141414;
        border: 1px solid #2a2a2a;
        border-radius: 14px;
        padding: 24px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
      }

      .cs-score {
        font-size: 40px;
        font-weight: 800;
        letter-spacing: -0.5px;
        padding: 6px 20px;
        border-radius: 8px;
      }

      .cs-score.accuracy-excellent { color: #00ff88; }
      .cs-score.accuracy-good      { color: #66eeaa; }
      .cs-score.accuracy-fair      { color: #ffcc44; }
      .cs-score.accuracy-poor      { color: #ff5555; }

      .cs-metrics {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 12px;
        width: 100%;
      }

      .cs-metric {
        background: #1a1a1a;
        border: 1px solid #242424;
        border-radius: 10px;
        padding: 12px;
        text-align: center;
      }

      .cs-metric-label {
        font-size: 12px;
        color: #666;
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .cs-metric-value {
        font-size: 22px;
        font-weight: 700;
        color: #e0e0e0;
      }

      .cs-no-result {
        font-size: 16px;
        color: #777;
        text-align: center;
        padding: 16px;
      }
    `
    document.head.appendChild(this.styleEl)
  }
}
