import type { Screen } from '../shell/Router'
import type { KeyboardStateData } from '../keyboard/KeyboardState'
import { KeyboardState } from '../keyboard/KeyboardState'

const SESSION_KEY = 'kb-session-text'

const LETTERS: string[][] = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['caps','z','x','c','v','b','n','m','backspace'],
  ['num_toggle','space','enter'],
]

const NUMBERS: string[][] = [
  ['1','2','3','4','5','6','7','8','9','0'],
  ['@','#','$','%','&','*','(',')','−','+'],
  ['.', ',','!','?',"'",'"',':',';','/','backspace'],
  ['abc_toggle','space','enter'],
]

export class KeyboardScreen implements Screen {
  private el: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null
  private layer: 'letters' | 'numbers' = 'letters'
  private clearPending = false
  private clearTimer: number | null = null
  private stateListener: ((s: KeyboardStateData) => void) | null = null

  // ── Handlers com referência estável para remoção ──────────────────────────
  private readonly onClearConfirm = () => {
    if (!this.clearPending) {
      this.clearPending = true
      this.updateClearBtn()
      this.clearTimer = window.setTimeout(() => {
        this.clearPending = false
        this.clearTimer = null
        this.updateClearBtn()
      }, 2000)
    } else {
      if (this.clearTimer !== null) { clearTimeout(this.clearTimer); this.clearTimer = null }
      this.clearPending = false
      KeyboardState.clear()
      this.updateClearBtn()
    }
  }

  private readonly onNumToggle = () => {
    this.layer = this.layer === 'letters' ? 'numbers' : 'letters'
    const grid = document.getElementById('kb-grid')
    if (grid) grid.innerHTML = this.renderGrid()
  }

  // ── Ciclo de vida ──────────────────────────────────────────────────────────

  mount(container: HTMLElement): void {
    this.injectStyles()

    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved && KeyboardState.getState().text === '') {
        KeyboardState.updateState({ text: saved })
      }
    } catch (_) {}

    this.el = document.createElement('div')
    this.el.id = 'kb-screen'
    this.el.className = 'kb-screen'
    container.appendChild(this.el)

    this.buildDOM()

    this.stateListener = (s) => this.onStateChange(s)
    KeyboardState.subscribe(this.stateListener)

    window.addEventListener('kb:clear-confirm', this.onClearConfirm)
    window.addEventListener('kb:num-toggle',    this.onNumToggle)
  }

  unmount(): void {
    try { localStorage.setItem(SESSION_KEY, KeyboardState.getState().text) } catch (_) {}

    if (this.stateListener) {
      KeyboardState.unsubscribe(this.stateListener)
      this.stateListener = null
    }
    window.removeEventListener('kb:clear-confirm', this.onClearConfirm)
    window.removeEventListener('kb:num-toggle',    this.onNumToggle)
    if (this.clearTimer !== null) { clearTimeout(this.clearTimer); this.clearTimer = null }

    this.el?.remove()
    this.el = null
    this.styleEl?.remove()
    this.styleEl = null
  }

  // ── Construção do DOM ──────────────────────────────────────────────────────

  private buildDOM(): void {
    if (!this.el) return

    this.el.innerHTML = `
      <div class="kb-text-area">
        <div class="kb-text-scroll" id="kb-text-scroll">
          <p class="kb-text-content" id="kb-text-content"></p>
        </div>
        <div class="kb-text-placeholder" id="kb-placeholder">Digite pelo olhar…</div>
      </div>

      <div class="kb-suggestions" id="kb-suggestions">
        <div class="kb-sug-empty">Sugestões</div>
      </div>

      <div class="kb-grid" id="kb-grid">${this.renderGrid()}</div>

      <div class="kb-action-bar">
        <button class="kb-action-btn dwell-target" data-key="speak" aria-label="Falar">
          <div class="dwell-fill"></div>
          <span class="key-content kb-action-inner">
            <span class="kb-ai">🔊</span><span class="kb-al">Falar</span>
          </span>
        </button>
        <button class="kb-action-btn dwell-target" id="kb-clear-btn" data-key="clear_confirm" aria-label="Limpar">
          <div class="dwell-fill"></div>
          <span class="key-content kb-action-inner">
            <span class="kb-ai" id="kb-clear-icon">🗑</span>
            <span class="kb-al" id="kb-clear-label">Limpar</span>
          </span>
        </button>
        <button class="kb-action-btn dwell-target" data-key="copy" aria-label="Copiar">
          <div class="dwell-fill"></div>
          <span class="key-content kb-action-inner">
            <span class="kb-ai">📋</span><span class="kb-al">Copiar</span>
          </span>
        </button>
        <button class="kb-action-btn dwell-target" data-key="nav:home" aria-label="Menu">
          <div class="dwell-fill"></div>
          <span class="key-content kb-action-inner">
            <span class="kb-ai">☰</span><span class="kb-al">Menu</span>
          </span>
        </button>
      </div>
    `

    const state = KeyboardState.getState()
    this.updateText(state)
    this.updateSuggestions(state)
  }

  // ── Renderização do grid ───────────────────────────────────────────────────

  private renderGrid(): string {
    const rows = this.layer === 'letters' ? LETTERS : NUMBERS
    const caps = KeyboardState.getState().isCaps
    return rows.map((row, ri) => {
      const indent = ri === 1 && this.layer === 'letters' ? ' kb-row-indent' : ''
      return `<div class="kb-row${indent}">${row.map(k => this.renderKey(k, caps)).join('')}</div>`
    }).join('')
  }

  private renderKey(key: string, caps: boolean): string {
    type KeyDef = { label: string; cls: string; dk?: string }
    const specials: Record<string, KeyDef> = {
      backspace:  { label: '⌫',              cls: 'kb-sp' },
      space:      { label: 'espaço',          cls: 'kb-space' },
      enter:      { label: '↵',              cls: 'kb-sp' },
      caps:       { label: caps ? '⇧ CAPS' : '⇧', cls: `kb-sp${caps ? ' kb-caps-on' : ''}` },
      num_toggle: { label: '123',             cls: 'kb-sp' },
      abc_toggle: { label: 'ABC',             cls: 'kb-sp', dk: 'num_toggle' },
    }
    const s = specials[key]
    const label = s ? s.label : (caps ? key.toUpperCase() : key.toLowerCase())
    const cls   = s ? s.cls   : ''
    const dk    = s?.dk ?? key
    const aria  = s ? s.label : label

    return `<button class="kb-key dwell-target ${cls}" data-key="${dk}" aria-label="${aria}">` +
           `<div class="dwell-fill"></div>` +
           `<span class="key-content">${label}</span>` +
           `</button>`
  }

  // ── Reatividade ao estado ──────────────────────────────────────────────────

  private onStateChange(state: KeyboardStateData): void {
    this.updateText(state)
    this.updateSuggestions(state)
    this.updateCapsKeys(state.isCaps)
  }

  private updateText(state: KeyboardStateData): void {
    const scroll = document.getElementById('kb-text-scroll')
    const el     = document.getElementById('kb-text-content')
    const ph     = document.getElementById('kb-placeholder')
    if (!el) return

    el.textContent = state.text
    const cursor = document.createElement('span')
    cursor.className = 'kb-cursor'
    cursor.textContent = '|'
    el.appendChild(cursor)

    if (ph) ph.style.display = state.text.length > 0 ? 'none' : 'flex'
    requestAnimationFrame(() => { if (scroll) scroll.scrollTop = scroll.scrollHeight })
  }

  private updateSuggestions(state: KeyboardStateData): void {
    const el = document.getElementById('kb-suggestions')
    if (!el) return
    if (state.suggestions.length === 0) {
      el.innerHTML = '<div class="kb-sug-empty">Sugestões</div>'
      return
    }
    el.innerHTML = state.suggestions.map(s =>
      `<button class="kb-sug dwell-target" data-key="sug_${s}">` +
      `<div class="dwell-fill"></div><span class="key-content">${s}</span></button>`
    ).join('')
  }

  private updateCapsKeys(caps: boolean): void {
    const capsKey = document.querySelector<HTMLElement>('[data-key="caps"]')
    if (capsKey) {
      capsKey.classList.toggle('kb-caps-on', caps)
      const c = capsKey.querySelector('.key-content')
      if (c) c.textContent = caps ? '⇧ CAPS' : '⇧'
    }
    document.querySelectorAll<HTMLElement>('.kb-key').forEach(k => {
      const key = k.dataset['key'] ?? ''
      if (key.length === 1) {
        const c = k.querySelector('.key-content')
        if (c) c.textContent = caps ? key.toUpperCase() : key.toLowerCase()
      }
    })
  }

  private updateClearBtn(): void {
    const btn   = document.getElementById('kb-clear-btn')
    const icon  = document.getElementById('kb-clear-icon')
    const label = document.getElementById('kb-clear-label')
    if (!btn) return
    if (this.clearPending) {
      btn.classList.add('kb-clear-pending')
      if (icon)  icon.textContent  = '⚠️'
      if (label) label.textContent = 'Confirmar?'
    } else {
      btn.classList.remove('kb-clear-pending')
      if (icon)  icon.textContent  = '🗑'
      if (label) label.textContent = 'Limpar'
    }
  }

  // ── Estilos ────────────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById('kb-screen-styles')) return
    this.styleEl = document.createElement('style')
    this.styleEl.id = 'kb-screen-styles'
    this.styleEl.textContent = `
      /* ── Shell ─────────────────────────────────────────────────────────── */
      .kb-screen {
        position: absolute;
        inset: 0;
        background: #060606;
        display: flex;
        flex-direction: column;
        color: #e0e0e0;
        font-family: system-ui, -apple-system, sans-serif;
        overflow: hidden;
        user-select: none;
      }

      /* ── Área de texto (25% da altura) ─────────────────────────────────── */
      .kb-text-area {
        flex: 0 0 25%;
        min-height: 140px;
        background: #0a0a0a;
        border-bottom: 1px solid #1a1a1a;
        position: relative;
        display: flex;
        align-items: stretch;
      }
      .kb-text-scroll {
        flex: 1;
        overflow-y: auto;
        padding: 16px 24px;
        scrollbar-width: thin;
        scrollbar-color: #333 transparent;
      }
      .kb-text-content {
        font-size: 28px;
        font-weight: 400;
        color: #ffffff;
        line-height: 1.5;
        margin: 0;
        word-break: break-word;
        white-space: pre-wrap;
        min-height: 40px;
      }
      .kb-text-placeholder {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        padding: 0 24px;
        font-size: 28px;
        color: #333;
        pointer-events: none;
      }
      .kb-cursor {
        color: #00fff7;
        font-weight: 300;
        animation: kb-blink 1s step-end infinite;
        display: inline;
      }
      @keyframes kb-blink { 50% { opacity: 0; } }

      /* ── Sugestões ─────────────────────────────────────────────────────── */
      .kb-suggestions {
        flex: 0 0 56px;
        display: flex;
        background: #0d0d0d;
        border-bottom: 1px solid #1a1a1a;
        overflow: hidden;
      }
      .kb-sug {
        flex: 1;
        background: transparent;
        border: none;
        border-right: 1px solid #1a1a1a;
        color: #00fff7;
        font-size: 18px;
        font-family: inherit;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        padding: 0 8px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .kb-sug:last-child { border-right: none; }
      .kb-sug.dwelling { background: rgba(0,255,247,0.08); }
      .kb-sug.clicked  { background: #00fff7; color: #000; }
      .kb-sug-empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #2a2a2a;
        font-size: 14px;
        letter-spacing: 0.5px;
        pointer-events: none;
      }

      /* ── Grid de teclas ────────────────────────────────────────────────── */
      .kb-grid {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .kb-row {
        flex: 1;
        display: flex;
        border-bottom: 1px solid #111;
      }
      .kb-row:last-child { border-bottom: none; }
      .kb-row-indent {
        padding: 0 3.5%;
      }

      /* tecla base */
      .kb-key {
        flex: 1;
        min-width: 72px;
        min-height: 72px;
        background: #0c0c0c;
        border: none;
        border-right: 1px solid #111;
        color: #e0e0e0;
        font-size: 26px;
        font-weight: 400;
        font-family: inherit;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        cursor: pointer;
        transition: background 0.08s;
      }
      .kb-key:last-child { border-right: none; }

      /* tecla especial (shift, backspace, etc.) */
      .kb-sp {
        background: #101010;
        color: #888;
        font-size: 22px;
        flex: 1.4;
      }

      /* espaço: 4× */
      .kb-space {
        flex: 4;
        color: #444;
        font-size: 16px;
        letter-spacing: 3px;
        background: #0c0c0c;
      }

      /* CAPS ativo */
      .kb-caps-on {
        color: #00fff7 !important;
        background: #00292a !important;
      }

      /* hover visual (mouse do cuidador) */
      .kb-key:hover,
      .kb-action-btn:hover {
        background: #181818;
      }

      /* ── Barra de ação ─────────────────────────────────────────────────── */
      .kb-action-bar {
        flex: 0 0 72px;
        display: flex;
        background: #080808;
        border-top: 1px solid #1a1a1a;
      }
      .kb-action-btn {
        flex: 1;
        background: transparent;
        border: none;
        border-right: 1px solid #1a1a1a;
        color: #bbb;
        font-family: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        transition: background 0.1s;
      }
      .kb-action-btn:last-child { border-right: none; }
      .kb-action-inner {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .kb-ai { font-size: 22px; line-height: 1; }
      .kb-al { font-size: 15px; font-weight: 500; }

      /* Limpar — estado de confirmação */
      .kb-clear-pending {
        color: #ff5555 !important;
        background: rgba(255,50,50,0.08) !important;
      }
      .kb-clear-pending .dwell-fill {
        background: rgba(255,60,60,0.3) !important;
      }

      /* ── Sistema de dwell (compartilhado) ──────────────────────────────── */
      .dwell-target {
        position: relative;
        overflow: hidden;
      }
      .dwell-fill {
        position: absolute;
        top: 0; left: 0;
        height: 100%; width: 0%;
        background: rgba(0,255,240,0.22);
        z-index: 0;
        pointer-events: none;
        transition: none;
      }
      .key-content {
        position: relative;
        z-index: 1;
        pointer-events: none;
      }
      .dwell-target.dwelling .dwell-fill {
        width: 100%;
        transition: width 500ms linear;
      }
      .dwell-target.clicked {
        background: #00fff7 !important;
        color: #000 !important;
        transition: background 0.08s, color 0.08s;
      }
    `
    document.head.appendChild(this.styleEl)
  }
}
