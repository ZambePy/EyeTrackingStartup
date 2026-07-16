import type { Screen } from '../shell/Router'
import { exportSessionLog } from '../sessionLog'

const SETTINGS_KEY = 'irisflow-settings'

export interface AppSettings {
  // Câmera
  cameraDeviceId: string
  cameraResolution: '720p' | '1080p' | 'auto'
  // OneEuroFilter
  filterMinCutoff: number
  filterBeta: number
  // Dwell & Blink
  dwellTimeMs: number
  dwellRadiusPx: number
  blinkMinFrames: number
  blinkEnabled: boolean
  // Acessibilidade
  cursorSize: 'small' | 'medium' | 'large'
  cursorColor: 'cyan' | 'white' | 'yellow'
  zoomFactor: 100 | 125 | 150
  ttsRate: number
  ttsVoiceURI: string
  // Sistema
  autoStart: boolean
  autoUpdaterEnabled: boolean
  // Acessibilidade avançada
  highContrast: boolean
}

const DEFAULTS: AppSettings = {
  cameraDeviceId:   '',
  cameraResolution: 'auto',
  filterMinCutoff:  0.5,
  filterBeta:       0.007,
  dwellTimeMs:      800,
  dwellRadiusPx:    40,
  blinkMinFrames:   4,
  blinkEnabled:     true,
  cursorSize:       'medium',
  cursorColor:      'cyan',
  zoomFactor:       100,
  ttsRate:          1.0,
  ttsVoiceURI:      '',
  autoStart:          false,
  autoUpdaterEnabled: false,
  highContrast:       false,
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) } : { ...DEFAULTS }
  } catch { return { ...DEFAULTS } }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

// ── Aplica configurações globais ao documento ─────────────────────────────────

export function applySettings(s: AppSettings): void {
  // Zoom
  document.documentElement.style.setProperty('--app-zoom', `${s.zoomFactor / 100}`)

  // Tamanho do cursor
  const sizes: Record<AppSettings['cursorSize'], string> = { small: '10px', medium: '16px', large: '24px' }
  document.documentElement.style.setProperty('--cursor-size', sizes[s.cursorSize])

  // Cor do cursor
  const colors: Record<AppSettings['cursorColor'], string> = { cyan: '#00fff7', white: '#ffffff', yellow: '#ffe066' }
  document.documentElement.style.setProperty('--cursor-color', colors[s.cursorColor])

  // Velocidade de dwell (propagada via CSS custom property)
  document.documentElement.style.setProperty('--dwell-duration', `${s.dwellTimeMs}ms`)

  // Modo alto contraste
  document.body.classList.toggle('high-contrast', s.highContrast)
}

// ── Tela ──────────────────────────────────────────────────────────────────────

export class SettingsScreen implements Screen {
  private el: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null
  private settings: AppSettings = loadSettings()
  private cameras: MediaDeviceInfo[] = []
  private voices: SpeechSynthesisVoice[] = []
  private testResultEl: HTMLElement | null = null
  private testRunning = false
  private testTimeout: ReturnType<typeof setTimeout> | null = null

  mount(container: HTMLElement): void {
    this.injectStyles()
    this.el = document.createElement('div')
    this.el.id = 'settings-screen'
    this.el.className = 'ss-root'
    container.appendChild(this.el)
    this.settings = loadSettings()

    // Carrega câmeras e vozes antes de renderizar
    Promise.all([this.loadCameras(), this.loadVoices()]).then(() => this.render())
  }

  unmount(): void {
    if (this.testTimeout) clearTimeout(this.testTimeout)
    this.el?.remove()
    this.el = null
    this.styleEl?.remove()
    this.styleEl = null
  }

  private async loadCameras(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      this.cameras  = devices.filter(d => d.kind === 'videoinput')
    } catch { this.cameras = [] }
  }

  private loadVoices(): Promise<void> {
    return new Promise(resolve => {
      const fill = () => {
        this.voices = window.speechSynthesis.getVoices().filter(v =>
          v.lang.startsWith('pt') || v.lang.startsWith('PT')
        )
        if (this.voices.length === 0) {
          this.voices = window.speechSynthesis.getVoices()
        }
        resolve()
      }
      if (window.speechSynthesis.getVoices().length > 0) { fill(); return }
      window.speechSynthesis.onvoiceschanged = () => { fill() }
      setTimeout(() => { fill() }, 1000)
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(): void {
    if (!this.el) return
    const s = this.settings

    const cameraOptions = this.cameras.length === 0
      ? `<option value="">Câmera padrão</option>`
      : `<option value="">Câmera padrão</option>` +
        this.cameras.map(c =>
          `<option value="${this.esc(c.deviceId)}" ${c.deviceId === s.cameraDeviceId ? 'selected' : ''}>
            ${this.esc(c.label || `Câmera ${c.deviceId.slice(0, 6)}`)}</option>`
        ).join('')

    const voiceOptions = this.voices.length === 0
      ? `<option value="">Voz padrão do sistema</option>`
      : `<option value="">Voz padrão do sistema</option>` +
        this.voices.map(v =>
          `<option value="${this.esc(v.voiceURI)}" ${v.voiceURI === s.ttsVoiceURI ? 'selected' : ''}>
            ${this.esc(v.name)} (${v.lang})</option>`
        ).join('')

    this.el.innerHTML = `
      <div class="ss-page">
        <div class="ss-page-header">
          <h1 class="ss-title">Configurações</h1>
          <p class="ss-subtitle">Ajuste parâmetros do sistema. Todas as configurações são salvas localmente.</p>
        </div>

        <!-- ── Câmera ───────────────────────────────────────────────── -->
        <section class="ss-section">
          <h2 class="ss-section-title">📷 Câmera</h2>

          <div class="ss-row">
            <label class="ss-label" for="ss-camera-device">Dispositivo de câmera</label>
            <select class="ss-select" id="ss-camera-device">${cameraOptions}</select>
          </div>

          <div class="ss-row">
            <label class="ss-label" for="ss-camera-res">Resolução</label>
            <select class="ss-select" id="ss-camera-res">
              <option value="auto"  ${s.cameraResolution === 'auto'  ? 'selected' : ''}>Automática</option>
              <option value="720p"  ${s.cameraResolution === '720p'  ? 'selected' : ''}>720p (HD)</option>
              <option value="1080p" ${s.cameraResolution === '1080p' ? 'selected' : ''}>1080p (Full HD)</option>
            </select>
          </div>

          <div class="ss-row ss-row--actions">
            <button class="ss-btn ss-btn--secondary" id="ss-test-detect">Testar Detecção (5s)</button>
            <div id="ss-test-result" class="ss-test-result"></div>
          </div>
        </section>

        <!-- ── OneEuroFilter ────────────────────────────────────────── -->
        <section class="ss-section">
          <h2 class="ss-section-title">〰 Filtro OneEuroFilter</h2>

          <div class="ss-slider-row">
            <label class="ss-label">Min Cutoff <span class="ss-val" id="ss-val-cutoff">${s.filterMinCutoff.toFixed(2)}</span></label>
            <input type="range" class="ss-slider" id="ss-cutoff"
              min="0.1" max="2.0" step="0.05" value="${s.filterMinCutoff}">
            <div class="ss-slider-hints"><span>0.1 (suave)</span><span>2.0 (responsivo)</span></div>
          </div>

          <div class="ss-slider-row">
            <label class="ss-label">Beta <span class="ss-val" id="ss-val-beta">${s.filterBeta.toFixed(4)}</span></label>
            <input type="range" class="ss-slider" id="ss-beta"
              min="0.001" max="0.05" step="0.001" value="${s.filterBeta}">
            <div class="ss-slider-hints"><span>0.001 (estável)</span><span>0.05 (rápido)</span></div>
          </div>

          <p class="ss-hint">Cursor de olhar reage imediatamente ao ajuste dos sliders.</p>
        </section>

        <!-- ── Dwell & Blink ────────────────────────────────────────── -->
        <section class="ss-section">
          <h2 class="ss-section-title">👁 Dwell & Blink</h2>

          <div class="ss-slider-row">
            <label class="ss-label">Tempo de dwell <span class="ss-val" id="ss-val-dwell">${s.dwellTimeMs}ms</span></label>
            <input type="range" class="ss-slider" id="ss-dwell"
              min="300" max="2000" step="100" value="${s.dwellTimeMs}">
            <div class="ss-slider-hints"><span>300ms (rápido)</span><span>2000ms (lento)</span></div>
          </div>

          <div class="ss-slider-row">
            <label class="ss-label">Raio de dwell <span class="ss-val" id="ss-val-radius">${s.dwellRadiusPx}px</span></label>
            <input type="range" class="ss-slider" id="ss-radius"
              min="20" max="80" step="5" value="${s.dwellRadiusPx}">
            <div class="ss-slider-hints"><span>20px (preciso)</span><span>80px (tolerante)</span></div>
          </div>

          <div class="ss-slider-row">
            <label class="ss-label">Frames mínimos blink <span class="ss-val" id="ss-val-blink">${s.blinkMinFrames}</span></label>
            <input type="range" class="ss-slider" id="ss-blink-frames"
              min="2" max="8" step="1" value="${s.blinkMinFrames}">
            <div class="ss-slider-hints"><span>2 (sensível)</span><span>8 (deliberado)</span></div>
          </div>

          <div class="ss-row ss-row--toggle">
            <span class="ss-label">Blink intencional ativo</span>
            <label class="ss-toggle">
              <input type="checkbox" id="ss-blink-enabled" ${s.blinkEnabled ? 'checked' : ''}>
              <span class="ss-toggle-track"></span>
            </label>
          </div>
        </section>

        <!-- ── Acessibilidade ───────────────────────────────────────── -->
        <section class="ss-section">
          <h2 class="ss-section-title">♿ Acessibilidade</h2>

          <div class="ss-row">
            <label class="ss-label">Tamanho do cursor</label>
            <div class="ss-radio-group">
              ${(['small','medium','large'] as const).map(sz =>
                `<label class="ss-radio-label">
                  <input type="radio" name="cursor-size" value="${sz}" ${s.cursorSize === sz ? 'checked' : ''}>
                  ${{ small: 'Pequeno', medium: 'Médio', large: 'Grande' }[sz]}
                </label>`
              ).join('')}
            </div>
          </div>

          <div class="ss-row">
            <label class="ss-label">Cor do cursor</label>
            <div class="ss-radio-group">
              ${(['cyan','white','yellow'] as const).map(c =>
                `<label class="ss-radio-label">
                  <input type="radio" name="cursor-color" value="${c}" ${s.cursorColor === c ? 'checked' : ''}>
                  <span class="ss-color-dot" style="background:${{ cyan:'#00fff7', white:'#ffffff', yellow:'#ffe066' }[c]}"></span>
                  ${{ cyan: 'Ciano', white: 'Branco', yellow: 'Amarelo' }[c]}
                </label>`
              ).join('')}
            </div>
          </div>

          <div class="ss-row">
            <label class="ss-label" for="ss-zoom">Zoom da interface</label>
            <select class="ss-select" id="ss-zoom">
              ${([100,125,150] as const).map(z =>
                `<option value="${z}" ${s.zoomFactor === z ? 'selected' : ''}>${z}%</option>`
              ).join('')}
            </select>
          </div>

          <div class="ss-slider-row">
            <label class="ss-label">Velocidade TTS <span class="ss-val" id="ss-val-tts">${s.ttsRate.toFixed(1)}×</span></label>
            <input type="range" class="ss-slider" id="ss-tts-rate"
              min="0.5" max="2" step="0.1" value="${s.ttsRate}">
            <div class="ss-slider-hints"><span>0.5× (devagar)</span><span>2.0× (rápido)</span></div>
          </div>

          <div class="ss-row">
            <label class="ss-label" for="ss-tts-voice">Voz PT-BR</label>
            <select class="ss-select" id="ss-tts-voice">${voiceOptions}</select>
          </div>

          <div class="ss-row ss-row--toggle">
            <span class="ss-label">Modo alto contraste (WCAG AAA)</span>
            <label class="ss-toggle">
              <input type="checkbox" id="ss-high-contrast" ${s.highContrast ? 'checked' : ''}>
              <span class="ss-toggle-track"></span>
            </label>
          </div>
        </section>

        <!-- ── Sistema ──────────────────────────────────────────────── -->
        <section class="ss-section">
          <h2 class="ss-section-title">⚙ Sistema</h2>

          <div class="ss-row ss-row--info">
            <span class="ss-label">Versão do IrisFlow</span>
            <span class="ss-value-text" id="ss-version">—</span>
          </div>

          <div class="ss-row ss-row--toggle">
            <span class="ss-label">Iniciar automaticamente com o sistema</span>
            <label class="ss-toggle">
              <input type="checkbox" id="ss-auto-start" ${s.autoStart ? 'checked' : ''}>
              <span class="ss-toggle-track"></span>
            </label>
          </div>

          <div class="ss-row ss-row--toggle">
            <div>
              <span class="ss-label">Atualizações automáticas</span>
              <p class="ss-hint" style="margin-top:4px">Verifica novas versões no GitHub (requer internet)</p>
            </div>
            <label class="ss-toggle">
              <input type="checkbox" id="ss-auto-updater" ${s.autoUpdaterEnabled ? 'checked' : ''}>
              <span class="ss-toggle-track"></span>
            </label>
          </div>

          <div class="ss-row ss-row--actions">
            <button class="ss-btn ss-btn--secondary" id="ss-export-log">Exportar Log de Sessão</button>
            <button class="ss-btn ss-btn--secondary" id="ss-accuracy-test">Diagnóstico de Acurácia</button>
          </div>
        </section>

        <!-- ── Rodapé ────────────────────────────────────────────────── -->
        <div class="ss-footer">
          <button class="ss-btn ss-btn--primary" id="ss-save">Salvar Configurações</button>
          <button class="ss-btn ss-btn--ghost" id="ss-back">← Voltar para Home</button>
        </div>
      </div>
    `

    this.testResultEl = this.el.querySelector('#ss-test-result')
    this.bindEvents()
    this.loadVersion()
  }

  // ── Eventos ───────────────────────────────────────────────────────────────

  private bindEvents(): void {
    if (!this.el) return

    // Sliders — atualiza label em tempo real + aplica ao GazeEngine imediatamente
    this.el.querySelector('#ss-cutoff')?.addEventListener('input', (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value)
      this.settings.filterMinCutoff = v
      const el = this.el?.querySelector('#ss-val-cutoff')
      if (el) el.textContent = v.toFixed(2)
      this.applyFilter()
    })

    this.el.querySelector('#ss-beta')?.addEventListener('input', (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value)
      this.settings.filterBeta = v
      const el = this.el?.querySelector('#ss-val-beta')
      if (el) el.textContent = v.toFixed(4)
      this.applyFilter()
    })

    this.el.querySelector('#ss-dwell')?.addEventListener('input', (e) => {
      const v = parseInt((e.target as HTMLInputElement).value)
      this.settings.dwellTimeMs = v
      const el = this.el?.querySelector('#ss-val-dwell')
      if (el) el.textContent = `${v}ms`
    })

    this.el.querySelector('#ss-radius')?.addEventListener('input', (e) => {
      const v = parseInt((e.target as HTMLInputElement).value)
      this.settings.dwellRadiusPx = v
      const el = this.el?.querySelector('#ss-val-radius')
      if (el) el.textContent = `${v}px`
    })

    this.el.querySelector('#ss-blink-frames')?.addEventListener('input', (e) => {
      const v = parseInt((e.target as HTMLInputElement).value)
      this.settings.blinkMinFrames = v
      const el = this.el?.querySelector('#ss-val-blink')
      if (el) el.textContent = `${v}`
    })

    this.el.querySelector('#ss-tts-rate')?.addEventListener('input', (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value)
      this.settings.ttsRate = v
      const el = this.el?.querySelector('#ss-val-tts')
      if (el) el.textContent = `${v.toFixed(1)}×`
    })

    // Selects
    this.el.querySelector('#ss-camera-device')?.addEventListener('change', (e) => {
      this.settings.cameraDeviceId = (e.target as HTMLSelectElement).value
    })

    this.el.querySelector('#ss-camera-res')?.addEventListener('change', (e) => {
      this.settings.cameraResolution = (e.target as HTMLSelectElement).value as AppSettings['cameraResolution']
    })

    this.el.querySelector('#ss-zoom')?.addEventListener('change', (e) => {
      const v = parseInt((e.target as HTMLSelectElement).value) as AppSettings['zoomFactor']
      this.settings.zoomFactor = v
      applySettings(this.settings)
    })

    this.el.querySelector('#ss-tts-voice')?.addEventListener('change', (e) => {
      this.settings.ttsVoiceURI = (e.target as HTMLSelectElement).value
    })

    // Radios
    this.el.querySelectorAll<HTMLInputElement>('input[name="cursor-size"]').forEach(r => {
      r.addEventListener('change', () => {
        if (r.checked) {
          this.settings.cursorSize = r.value as AppSettings['cursorSize']
          applySettings(this.settings)
        }
      })
    })

    this.el.querySelectorAll<HTMLInputElement>('input[name="cursor-color"]').forEach(r => {
      r.addEventListener('change', () => {
        if (r.checked) {
          this.settings.cursorColor = r.value as AppSettings['cursorColor']
          applySettings(this.settings)
        }
      })
    })

    // Toggles
    this.el.querySelector('#ss-blink-enabled')?.addEventListener('change', (e) => {
      this.settings.blinkEnabled = (e.target as HTMLInputElement).checked
    })

    this.el.querySelector('#ss-auto-start')?.addEventListener('change', (e) => {
      this.settings.autoStart = (e.target as HTMLInputElement).checked
    })

    this.el.querySelector('#ss-auto-updater')?.addEventListener('change', (e) => {
      this.settings.autoUpdaterEnabled = (e.target as HTMLInputElement).checked
      // Notifica o processo principal via IPC quando disponível
      document.dispatchEvent(new CustomEvent('irisflow:setAutoUpdater', {
        detail: { enabled: this.settings.autoUpdaterEnabled }
      }))
    })

    this.el.querySelector('#ss-high-contrast')?.addEventListener('change', (e) => {
      this.settings.highContrast = (e.target as HTMLInputElement).checked
      document.body.classList.toggle('high-contrast', this.settings.highContrast)
    })

    // Ações do sistema
    this.el.querySelector('#ss-test-detect')?.addEventListener('click', () => this.runDetectionTest())

    this.el.querySelector('#ss-export-log')?.addEventListener('click', () => {
      exportSessionLog()
      this.showToast('Log de sessão exportado.')
    })

    this.el.querySelector('#ss-accuracy-test')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('irisflow:navigate', { detail: { route: 'calibration' } }))
    })

    // Salvar
    this.el.querySelector('#ss-save')?.addEventListener('click', () => {
      saveSettings(this.settings)
      applySettings(this.settings)
      this.showToast('Configurações salvas.')
    })

    this.el.querySelector('#ss-back')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('irisflow:navigate', { detail: { route: 'home' } }))
    })
  }

  // ── Aplica filtro em tempo real via GazeEngine ────────────────────────────

  private applyFilter(): void {
    try {
      // Import dinâmico para evitar dependência circular no bundle
      // O GazeEngine expõe applyFilterParams globalmente via evento
      document.dispatchEvent(new CustomEvent('irisflow:applyFilter', {
        detail: { minCutoff: this.settings.filterMinCutoff, beta: this.settings.filterBeta }
      }))
    } catch { /* silent */ }
  }

  // ── Teste de detecção 5s ──────────────────────────────────────────────────

  private runDetectionTest(): void {
    if (this.testRunning) return
    this.testRunning = true
    const resultEl = this.testResultEl
    if (resultEl) {
      resultEl.textContent = 'Testando… (5s)'
      resultEl.className = 'ss-test-result ss-test-result--running'
    }

    let detected = 0
    let total    = 0
    const start  = performance.now()

    const countFrames = () => {
      total++
      // Verifica se o GazeEngine detectou rosto neste frame lendo o cursor
      const laser = document.getElementById('laser')
      if (laser && laser.style.display !== 'none' && laser.style.opacity !== '0') {
        detected++
      }
      if (performance.now() - start < 5000) {
        requestAnimationFrame(countFrames)
      } else {
        const pct = total > 0 ? Math.round((detected / total) * 100) : 0
        this.testRunning = false
        if (resultEl) {
          resultEl.textContent = `Detecção: ${pct}% dos frames (${detected}/${total})`
          resultEl.className = 'ss-test-result ' + (pct >= 70 ? 'ss-test-result--ok' : 'ss-test-result--warn')
        }
      }
    }
    requestAnimationFrame(countFrames)
  }

  // ── Versão do app ─────────────────────────────────────────────────────────

  private loadVersion(): void {
    const el = this.el?.querySelector('#ss-version')
    if (!el) return
    if (window.irisflow?.getAppVersion) {
      window.irisflow.getAppVersion().then(v => { el.textContent = v }).catch(() => { el.textContent = 'dev' })
    } else {
      el.textContent = 'dev (web)'
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  private showToast(msg: string): void {
    const t = document.createElement('div')
    t.className = 'ss-toast'
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 3000)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  // ── Estilos ───────────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById('ss-styles')) return
    this.styleEl = document.createElement('style')
    this.styleEl.id = 'ss-styles'
    this.styleEl.textContent = `
      .ss-root {
        display: flex; align-items: flex-start; justify-content: center;
        min-height: 100%; width: 100%;
        background: #0D0D0D; color: #e0e0e0;
        font-family: system-ui, -apple-system, sans-serif;
        overflow-y: auto; padding: 32px 16px 48px; box-sizing: border-box;
      }
      .ss-page {
        width: 100%; max-width: 720px;
        display: flex; flex-direction: column; gap: 28px;
      }
      .ss-page-header { display: flex; flex-direction: column; gap: 6px; }
      .ss-title  { margin: 0; font-size: 26px; font-weight: 700; color: #fff; }
      .ss-subtitle { margin: 0; font-size: 15px; color: #666; line-height: 1.5; }

      /* Sections */
      .ss-section {
        background: #141414; border: 1px solid #222; border-radius: 14px;
        padding: 24px; display: flex; flex-direction: column; gap: 20px;
      }
      .ss-section-title {
        margin: 0 0 4px; font-size: 16px; font-weight: 600;
        color: #00fff7; letter-spacing: 0.2px;
      }

      /* Rows */
      .ss-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: 16px; flex-wrap: wrap;
      }
      .ss-row--toggle  { min-height: 40px; }
      .ss-row--actions { gap: 12px; justify-content: flex-start; }
      .ss-row--info    { }

      .ss-label {
        font-size: 14px; font-weight: 500; color: #aaa;
        display: flex; align-items: center; gap: 8px;
      }
      .ss-val {
        font-size: 13px; color: #00fff7; font-weight: 700;
        background: #0a1a1a; padding: 2px 8px; border-radius: 4px;
      }
      .ss-value-text { font-size: 14px; color: #ccc; }

      /* Select */
      .ss-select {
        background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 8px;
        color: #e0e0e0; font-size: 14px; padding: 8px 12px;
        font-family: inherit; outline: none; cursor: pointer;
        min-width: 200px; flex-shrink: 0;
        transition: border-color 0.15s;
      }
      .ss-select:focus { border-color: #00fff770; }

      /* Slider */
      .ss-slider-row { display: flex; flex-direction: column; gap: 8px; }
      .ss-slider {
        width: 100%; accent-color: #00fff7; cursor: pointer;
        height: 6px; border-radius: 4px;
      }
      .ss-slider-hints {
        display: flex; justify-content: space-between;
        font-size: 12px; color: #555;
      }

      /* Radio */
      .ss-radio-group { display: flex; gap: 16px; flex-wrap: wrap; }
      .ss-radio-label {
        display: flex; align-items: center; gap: 6px;
        font-size: 14px; color: #ccc; cursor: pointer;
      }
      .ss-radio-label input[type="radio"] { accent-color: #00fff7; cursor: pointer; }
      .ss-color-dot {
        width: 14px; height: 14px; border-radius: 50%;
        display: inline-block; border: 1px solid #444;
      }

      /* Toggle */
      .ss-toggle { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
      .ss-toggle input { opacity: 0; width: 0; height: 0; }
      .ss-toggle-track {
        position: absolute; inset: 0; cursor: pointer;
        background: #2a2a2a; border-radius: 24px; transition: background 0.2s;
      }
      .ss-toggle-track::after {
        content: ''; position: absolute;
        left: 3px; top: 3px; width: 18px; height: 18px;
        background: #666; border-radius: 50%; transition: transform 0.2s, background 0.2s;
      }
      .ss-toggle input:checked + .ss-toggle-track { background: #00fff740; }
      .ss-toggle input:checked + .ss-toggle-track::after {
        transform: translateX(20px); background: #00fff7;
      }

      /* Buttons */
      .ss-btn {
        padding: 10px 18px; border-radius: 8px; border: none;
        font-size: 14px; font-weight: 600; cursor: pointer;
        font-family: inherit; transition: opacity 0.15s, transform 0.1s;
        white-space: nowrap;
      }
      .ss-btn:hover { opacity: 0.85; transform: translateY(-1px); }
      .ss-btn:active { transform: translateY(0); opacity: 0.7; }
      .ss-btn--primary   { background: #00fff7; color: #0a0a0a; }
      .ss-btn--secondary { background: #1e1e2e; color: #ccc; border: 1px solid #333; }
      .ss-btn--ghost     { background: transparent; color: #888; border: 1px solid #2a2a2a; }

      /* Test result */
      .ss-test-result {
        font-size: 14px; font-weight: 500; padding: 6px 12px; border-radius: 6px;
        min-width: 120px;
      }
      .ss-test-result--running { color: #aaa; background: #1a1a1a; }
      .ss-test-result--ok      { color: #00ff88; background: #00ff6615; border: 1px solid #00ff6630; }
      .ss-test-result--warn    { color: #ffbb33; background: #ffaa0015; border: 1px solid #ffaa0030; }

      /* Hint */
      .ss-hint { margin: 0; font-size: 13px; color: #555; font-style: italic; }

      /* Footer */
      .ss-footer { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding-top: 8px; }

      /* Toast */
      .ss-toast {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: #1a2a1a; border: 1px solid #00ff6650; color: #00ff88;
        padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 500;
        z-index: 99999; animation: ss-toast-in 0.2s ease; pointer-events: none;
      }
      @keyframes ss-toast-in {
        from { opacity: 0; transform: translateX(-50%) translateY(8px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    `
    document.head.appendChild(this.styleEl)
  }
}
