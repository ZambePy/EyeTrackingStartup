import type { Screen } from '../shell/Router'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface QPhrase {
  id: string
  text: string
  categoryId: string
}

interface QCategory {
  id: string
  name: string
  icon: string
}

// ── Frases padrão PT-BR (~40 frases, 5 categorias) ────────────────────────────

const DEFAULT_CATEGORIES: QCategory[] = [
  { id: 'necessidades', name: 'Necessidades', icon: '🍽️' },
  { id: 'sentimentos',  name: 'Sentimentos',  icon: '❤️' },
  { id: 'perguntas',    name: 'Perguntas',    icon: '❓' },
  { id: 'desconforto',  name: 'Desconforto',  icon: '🤕' },
  { id: 'familia',      name: 'Família',      icon: '👨‍👩‍👧' },
]

const DEFAULT_PHRASES: QPhrase[] = [
  // Necessidades básicas
  { id: 'n1', categoryId: 'necessidades', text: 'Quero água' },
  { id: 'n2', categoryId: 'necessidades', text: 'Quero comida' },
  { id: 'n3', categoryId: 'necessidades', text: 'Preciso ir ao banheiro' },
  { id: 'n4', categoryId: 'necessidades', text: 'Estou com fome' },
  { id: 'n5', categoryId: 'necessidades', text: 'Estou com sede' },
  { id: 'n6', categoryId: 'necessidades', text: 'Estou com frio' },
  { id: 'n7', categoryId: 'necessidades', text: 'Estou com calor' },
  { id: 'n8', categoryId: 'necessidades', text: 'Quero descansar' },
  // Sentimentos
  { id: 's1', categoryId: 'sentimentos', text: 'Estou bem' },
  { id: 's2', categoryId: 'sentimentos', text: 'Estou mal' },
  { id: 's3', categoryId: 'sentimentos', text: 'Estou cansado' },
  { id: 's4', categoryId: 'sentimentos', text: 'Estou com medo' },
  { id: 's5', categoryId: 'sentimentos', text: 'Estou feliz' },
  { id: 's6', categoryId: 'sentimentos', text: 'Estou triste' },
  { id: 's7', categoryId: 'sentimentos', text: 'Preciso de ajuda' },
  { id: 's8', categoryId: 'sentimentos', text: 'Me sinto ansioso' },
  // Perguntas
  { id: 'p1', categoryId: 'perguntas', text: 'Que horas são?' },
  { id: 'p2', categoryId: 'perguntas', text: 'O que aconteceu?' },
  { id: 'p3', categoryId: 'perguntas', text: 'Onde estamos?' },
  { id: 'p4', categoryId: 'perguntas', text: 'Quem está aqui?' },
  { id: 'p5', categoryId: 'perguntas', text: 'Quando chega o médico?' },
  { id: 'p6', categoryId: 'perguntas', text: 'Pode me ajudar?' },
  { id: 'p7', categoryId: 'perguntas', text: 'Pode chamar alguém?' },
  { id: 'p8', categoryId: 'perguntas', text: 'Tudo bem com vocês?' },
  // Desconforto / Dor
  { id: 'd1', categoryId: 'desconforto', text: 'Estou com dor' },
  { id: 'd2', categoryId: 'desconforto', text: 'A dor está forte' },
  { id: 'd3', categoryId: 'desconforto', text: 'Preciso de remédio' },
  { id: 'd4', categoryId: 'desconforto', text: 'Chame o médico' },
  { id: 'd5', categoryId: 'desconforto', text: 'Não consigo respirar bem' },
  { id: 'd6', categoryId: 'desconforto', text: 'Estou desconfortável' },
  { id: 'd7', categoryId: 'desconforto', text: 'Me ajude a me mover' },
  { id: 'd8', categoryId: 'desconforto', text: 'Preciso mudar de posição' },
  // Família
  { id: 'f1', categoryId: 'familia', text: 'Quero falar com minha família' },
  { id: 'f2', categoryId: 'familia', text: 'Onde está minha esposa?' },
  { id: 'f3', categoryId: 'familia', text: 'Onde estão meus filhos?' },
  { id: 'f4', categoryId: 'familia', text: 'Ligue para minha família' },
  { id: 'f5', categoryId: 'familia', text: 'Saudade de vocês' },
  { id: 'f6', categoryId: 'familia', text: 'Obrigado pelo cuidado' },
  { id: 'f7', categoryId: 'familia', text: 'Eu amo vocês' },
  { id: 'f8', categoryId: 'familia', text: 'Estou orgulhoso de vocês' },
]

const PHRASES_PER_PAGE = 6
const FAV_KEY  = 'qp-favorites'
export const CAT_KEY    = 'qp-categories'
export const PHRASE_KEY = 'qp-phrases'

export { DEFAULT_CATEGORIES, DEFAULT_PHRASES }
export type { QPhrase, QCategory }

// ── Tela ───────────────────────────────────────────────────────────────────────

type QView = 'categories' | 'phrases' | 'selected'


export class QuickPhrasesScreen implements Screen {
  private el: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null

  private view: QView = 'categories'
  private activeCatId: string | null = null
  private selectedPhraseId: string | null = null
  private currentPage = 0

  private categories: QCategory[] = [...DEFAULT_CATEGORIES]
  private phrases: QPhrase[]      = [...DEFAULT_PHRASES]
  private favorites: Set<string>  = new Set()

  private readonly onQpAction = (e: Event) => {
    this.handleAction((e as CustomEvent<string>).detail)
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  mount(container: HTMLElement): void {
    this.injectStyles()
    this.loadPersisted()

    this.el = document.createElement('div')
    this.el.id = 'qp-screen'
    this.el.className = 'qp-screen'
    container.appendChild(this.el)

    window.addEventListener('irisflow:qp-action', this.onQpAction as EventListener)
    this.render()
  }

  unmount(): void {
    window.removeEventListener('irisflow:qp-action', this.onQpAction as EventListener)
    this.saveFavorites()
    this.el?.remove()
    this.el = null
    this.styleEl?.remove()
    this.styleEl = null
    // reset state so next mount starts fresh
    this.view = 'categories'
    this.activeCatId = null
    this.selectedPhraseId = null
    this.currentPage = 0
  }

  // ── Persistência ───────────────────────────────────────────────────────────

  private loadPersisted(): void {
    try {
      const rawFav = localStorage.getItem(FAV_KEY)
      if (rawFav) this.favorites = new Set(JSON.parse(rawFav) as string[])
      const rawCat = localStorage.getItem(CAT_KEY)
      if (rawCat) this.categories = JSON.parse(rawCat) as QCategory[]
      const rawPhr = localStorage.getItem(PHRASE_KEY)
      if (rawPhr) this.phrases = JSON.parse(rawPhr) as QPhrase[]
    } catch (_) {}
    this.syncFromIPC()
  }

  private saveFavorites(): void {
    const arr = [...this.favorites]
    try { localStorage.setItem(FAV_KEY, JSON.stringify(arr)) } catch (_) {}
    this.syncToIPC(arr)
  }

  private async syncFromIPC(): Promise<void> {
    try {
      const data = await window.irisflow?.loadPhrases?.() as { favorites?: string[] } | null
      if (data?.favorites) {
        this.favorites = new Set(data.favorites)
        if (this.el) this.render()
      }
    } catch (_) {}
  }

  private async syncToIPC(favorites: string[]): Promise<void> {
    try { await window.irisflow?.savePhrases?.({ favorites }) } catch (_) {}
  }

  // ── Ações (disparadas pelo DwellManager via irisflow:qp-action) ───────────

  private handleAction(key: string): void {
    if (key === 'qp:back') {
      if (this.view === 'selected') {
        this.view = 'phrases'
        this.selectedPhraseId = null
      } else {
        this.view = 'categories'
        this.activeCatId = null
        this.currentPage = 0
      }
      this.render()
      return
    }

    if (key === 'qp:speak') {
      const p = this.phrases.find(ph => ph.id === this.selectedPhraseId)
      if (p) this.speak(p.text)
      return
    }

    if (key === 'qp:fav') {
      if (!this.selectedPhraseId) return
      if (this.favorites.has(this.selectedPhraseId)) {
        this.favorites.delete(this.selectedPhraseId)
      } else {
        this.favorites.add(this.selectedPhraseId)
      }
      this.saveFavorites()
      this.render()
      return
    }

    if (key === 'qp:prev') {
      if (this.currentPage > 0) { this.currentPage--; this.render() }
      return
    }

    if (key === 'qp:next') {
      const maxPage = Math.ceil(this.getActivePhrases().length / PHRASES_PER_PAGE) - 1
      if (this.currentPage < maxPage) { this.currentPage++; this.render() }
      return
    }

    if (key.startsWith('qp:cat:')) {
      this.activeCatId = key.slice(7)
      this.view = 'phrases'
      this.currentPage = 0
      this.render()
      return
    }

    if (key.startsWith('qp:phrase:')) {
      this.selectedPhraseId = key.slice(10)
      this.view = 'selected'
      this.render()
      return
    }
  }

  private speak(text: string): void {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 0.9
    utt.pitch = 1.0
    const ptVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('pt'))
    if (ptVoice) utt.voice = ptVoice
    window.speechSynthesis.speak(utt)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getActivePhrases(): QPhrase[] {
    if (this.activeCatId === 'favoritas') {
      return this.phrases.filter(p => this.favorites.has(p.id))
    }
    return this.phrases.filter(p => p.categoryId === this.activeCatId)
  }

  private getAllCategories(): Array<QCategory & { isFav?: boolean }> {
    return [
      { id: 'favoritas', name: 'Favoritas', icon: '⭐', isFav: true },
      ...this.categories,
    ]
  }

  private esc(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  // ── Renderização ───────────────────────────────────────────────────────────

  private render(): void {
    if (!this.el) return
    switch (this.view) {
      case 'categories': this.renderCategories(); break
      case 'phrases':    this.renderPhrases();    break
      case 'selected':   this.renderSelected();   break
    }
  }

  // Fase 1 — grade de categorias (máx. 6 visíveis)
  private renderCategories(): void {
    if (!this.el) return
    const cats = this.getAllCategories().slice(0, 6)

    this.el.innerHTML = `
      <div class="qp-header">
        <button class="qp-icon-btn dwell-target" data-key="nav:home" aria-label="Menu">
          <div class="dwell-fill"></div>
          <span class="key-content">☰</span>
        </button>
        <h1 class="qp-title">Frases Rápidas</h1>
      </div>

      <div class="qp-cat-grid">
        ${cats.map(cat => `
          <button class="qp-cat-btn dwell-target" data-key="qp:cat:${cat.id}" aria-label="${cat.name}">
            <div class="dwell-fill"></div>
            <span class="key-content qp-cat-inner">
              <span class="qp-cat-icon">${cat.icon}</span>
              <span class="qp-cat-name">${cat.name}</span>
              ${cat.isFav
                ? `<span class="qp-cat-badge">${this.favorites.size} frase${this.favorites.size !== 1 ? 's' : ''}</span>`
                : ''}
            </span>
          </button>
        `).join('')}
      </div>
    `
  }

  // Fase 2 — lista de frases com paginação
  private renderPhrases(): void {
    if (!this.el) return
    const cat = this.getAllCategories().find(c => c.id === this.activeCatId)
    const allPhrases = this.getActivePhrases()
    const totalPages = Math.max(1, Math.ceil(allPhrases.length / PHRASES_PER_PAGE))
    const page = allPhrases.slice(
      this.currentPage * PHRASES_PER_PAGE,
      (this.currentPage + 1) * PHRASES_PER_PAGE,
    )

    const hasPrev = this.currentPage > 0
    const hasNext = this.currentPage < totalPages - 1

    this.el.innerHTML = `
      <div class="qp-header">
        <button class="qp-back-btn dwell-target" data-key="qp:back" aria-label="Voltar">
          <div class="dwell-fill"></div>
          <span class="key-content">← Voltar</span>
        </button>
        <h1 class="qp-title">${cat?.icon ?? '📋'} ${cat?.name ?? ''}</h1>
      </div>

      <div class="qp-phrase-list">
        ${page.length === 0
          ? `<div class="qp-empty">
              ${this.activeCatId === 'favoritas'
                ? 'Nenhuma frase favorita ainda.<br>Selecione uma frase e toque em ✩ para favoritar.'
                : 'Nenhuma frase nesta categoria.'}
            </div>`
          : page.map(p => `
            <button class="qp-phrase-btn dwell-target" data-key="qp:phrase:${p.id}" aria-label="${this.esc(p.text)}">
              <div class="dwell-fill"></div>
              <span class="key-content qp-phrase-inner">
                ${this.favorites.has(p.id) ? '<span class="qp-inline-star">⭐</span>' : ''}
                <span class="qp-phrase-text">${this.esc(p.text)}</span>
              </span>
            </button>
          `).join('')
        }
      </div>

      ${totalPages > 1 ? `
        <div class="qp-pagination">
          <button class="qp-pag-btn dwell-target${hasPrev ? '' : ' qp-pag-off'}" data-key="qp:prev" aria-label="Anterior">
            <div class="dwell-fill"></div>
            <span class="key-content">←</span>
          </button>
          <span class="qp-pag-info">${this.currentPage + 1} / ${totalPages}</span>
          <button class="qp-pag-btn dwell-target${hasNext ? '' : ' qp-pag-off'}" data-key="qp:next" aria-label="Próxima">
            <div class="dwell-fill"></div>
            <span class="key-content">→</span>
          </button>
        </div>
      ` : ''}
    `
  }

  // Fase 3 — frase selecionada + ações
  private renderSelected(): void {
    if (!this.el) return
    const phrase = this.phrases.find(p => p.id === this.selectedPhraseId)
    if (!phrase) { this.view = 'phrases'; this.render(); return }
    const isFav = this.favorites.has(phrase.id)

    this.el.innerHTML = `
      <div class="qp-header">
        <button class="qp-back-btn dwell-target" data-key="qp:back" aria-label="Voltar">
          <div class="dwell-fill"></div>
          <span class="key-content">← Voltar</span>
        </button>
        <h1 class="qp-title">Frase Selecionada</h1>
      </div>

      <div class="qp-sel-display">
        <div class="qp-sel-text">${this.esc(phrase.text)}</div>
      </div>

      <div class="qp-sel-actions">
        <button class="qp-sel-btn qp-btn-speak dwell-target" data-key="qp:speak" aria-label="Falar imediatamente">
          <div class="dwell-fill"></div>
          <span class="key-content qp-sel-inner">
            <span class="qp-sel-icon">🔊</span>
            <span class="qp-sel-label">Falar imediatamente</span>
          </span>
        </button>
        <button class="qp-sel-btn qp-btn-fav${isFav ? ' qp-fav-on' : ''} dwell-target" data-key="qp:fav" aria-label="${isFav ? 'Remover favorito' : 'Favoritar'}">
          <div class="dwell-fill"></div>
          <span class="key-content qp-sel-inner">
            <span class="qp-sel-icon">${isFav ? '⭐' : '✩'}</span>
            <span class="qp-sel-label">${isFav ? 'Remover Favorito' : 'Favoritar'}</span>
          </span>
        </button>
      </div>
    `
  }

  // ── Estilos ────────────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById('qp-styles')) return
    this.styleEl = document.createElement('style')
    this.styleEl.id = 'qp-styles'
    this.styleEl.textContent = `
      /* ── Shell ───────────────────────────────────────────────────────────── */
      .qp-screen {
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

      /* ── Header ──────────────────────────────────────────────────────────── */
      .qp-header {
        flex: 0 0 64px;
        background: #0a0a0a;
        border-bottom: 1px solid #1a1a1a;
        display: flex;
        align-items: center;
        padding: 0 20px;
        gap: 16px;
      }
      .qp-title {
        flex: 1;
        font-size: 22px;
        font-weight: 600;
        color: #fff;
        text-align: center;
        margin: 0;
      }
      .qp-back-btn {
        min-width: 140px;
        height: 44px;
        background: #111;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        color: #aaa;
        font-size: 16px;
        font-family: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        flex-shrink: 0;
      }
      .qp-icon-btn {
        width: 52px;
        height: 44px;
        background: #111;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        color: #aaa;
        font-size: 20px;
        font-family: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        flex-shrink: 0;
      }

      /* ── Grade de categorias ─────────────────────────────────────────────── */
      .qp-cat-grid {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        padding: 28px 32px;
        overflow: hidden;
      }
      .qp-cat-btn {
        min-width: 180px;
        min-height: 120px;
        background: #0d0d0d;
        border: 1.5px solid #1e1e1e;
        border-radius: 18px;
        color: #e0e0e0;
        font-family: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        transition: border-color 0.15s, background 0.15s;
      }
      .qp-cat-btn.dwelling {
        border-color: #00fff7;
        background: #001a1a;
      }
      .qp-cat-btn.clicked {
        background: #00fff7 !important;
        color: #000 !important;
      }
      .qp-cat-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }
      .qp-cat-icon { font-size: 42px; line-height: 1; }
      .qp-cat-name { font-size: 20px; font-weight: 600; }
      .qp-cat-badge {
        font-size: 13px;
        color: #00fff7;
        background: rgba(0,255,247,0.1);
        padding: 2px 10px;
        border-radius: 12px;
        border: 1px solid rgba(0,255,247,0.2);
      }

      /* ── Lista de frases ─────────────────────────────────────────────────── */
      .qp-phrase-list {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 16px 32px;
        gap: 10px;
        overflow: hidden;
      }
      .qp-phrase-btn {
        flex: 1;
        min-height: 80px;
        background: #0d0d0d;
        border: 1.5px solid #1e1e1e;
        border-radius: 10px;
        color: #e0e0e0;
        font-size: 22px;
        font-family: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        padding: 0 24px;
        position: relative;
        overflow: hidden;
        transition: border-color 0.15s, background 0.15s;
        text-align: left;
        width: 100%;
      }
      .qp-phrase-btn.dwelling {
        border-color: #00fff7;
        background: #001a1a;
      }
      .qp-phrase-btn.clicked {
        background: #00fff7 !important;
        color: #000 !important;
      }
      .qp-phrase-inner {
        display: flex;
        align-items: center;
        gap: 14px;
        width: 100%;
      }
      .qp-phrase-text { flex: 1; }
      .qp-inline-star { font-size: 18px; flex-shrink: 0; }

      .qp-empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        color: #444;
        font-size: 18px;
        line-height: 1.6;
        padding: 24px;
      }

      /* ── Paginação ───────────────────────────────────────────────────────── */
      .qp-pagination {
        flex: 0 0 72px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 32px;
        border-top: 1px solid #1a1a1a;
        background: #080808;
      }
      .qp-pag-btn {
        width: 140px;
        height: 52px;
        background: #0d0d0d;
        border: 1.5px solid #1e1e1e;
        border-radius: 8px;
        color: #e0e0e0;
        font-size: 22px;
        font-family: inherit;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: border-color 0.15s;
      }
      .qp-pag-btn.dwelling { border-color: #00fff7; }
      .qp-pag-btn.clicked { background: #00fff7 !important; color: #000 !important; }
      .qp-pag-off { opacity: 0.25; pointer-events: none; }
      .qp-pag-info {
        font-size: 18px;
        color: #555;
        min-width: 80px;
        text-align: center;
      }

      /* ── Frase selecionada ───────────────────────────────────────────────── */
      .qp-sel-display {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 64px;
      }
      .qp-sel-text {
        font-size: 38px;
        font-weight: 500;
        color: #fff;
        text-align: center;
        line-height: 1.4;
        padding: 36px 56px;
        background: #0c0c0c;
        border: 2px solid #00fff7;
        border-radius: 20px;
        max-width: 860px;
        box-shadow: 0 0 48px rgba(0,255,247,0.07);
        animation: qp-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes qp-pop {
        from { transform: scale(0.94); opacity: 0; }
        to   { transform: scale(1);    opacity: 1; }
      }
      .qp-sel-actions {
        flex: 0 0 100px;
        display: flex;
        border-top: 1px solid #1a1a1a;
      }
      .qp-sel-btn {
        flex: 1;
        background: #080808;
        border: none;
        border-right: 1px solid #1a1a1a;
        color: #ccc;
        font-family: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        transition: background 0.1s;
      }
      .qp-sel-btn:last-child { border-right: none; }
      .qp-btn-speak { color: #00fff7; }
      .qp-btn-speak.dwelling { background: rgba(0,255,247,0.06); }
      .qp-fav-on { color: #ffd700; }
      .qp-sel-inner {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .qp-sel-icon  { font-size: 30px; line-height: 1; }
      .qp-sel-label { font-size: 20px; font-weight: 600; }

      /* ── Animação de entrada entre views ─────────────────────────────────── */
      .qp-cat-grid,
      .qp-phrase-list,
      .qp-sel-display {
        animation: qp-slide-in 0.18s ease-out;
      }
      @keyframes qp-slide-in {
        from { opacity: 0; transform: translateX(18px); }
        to   { opacity: 1; transform: translateX(0); }
      }

      /* ── Sistema de dwell (autossuficiente) ──────────────────────────────── */
      .dwell-target   { position: relative; overflow: hidden; }
      .dwell-fill {
        position: absolute; top: 0; left: 0;
        height: 100%; width: 0%;
        background: rgba(0,255,240,0.22);
        z-index: 0; pointer-events: none;
      }
      .key-content { position: relative; z-index: 1; pointer-events: none; }
      .dwell-target.dwelling .dwell-fill { width: 100%; transition: width 500ms linear; }
      .dwell-target.clicked {
        background: #00fff7 !important;
        color: #000 !important;
        transition: background 0.08s, color 0.08s;
      }
    `
    document.head.appendChild(this.styleEl)
  }
}
