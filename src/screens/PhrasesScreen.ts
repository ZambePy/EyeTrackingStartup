import type { Screen } from '../shell/Router'
import {
  CAT_KEY,
  PHRASE_KEY,
  DEFAULT_CATEGORIES,
  DEFAULT_PHRASES,
} from './QuickPhrasesScreen'
import type { QCategory, QPhrase } from './QuickPhrasesScreen'

// ── Persistência ───────────────────────────────────────────────────────────────

function loadCategories(): QCategory[] {
  try {
    const raw = localStorage.getItem(CAT_KEY)
    return raw ? (JSON.parse(raw) as QCategory[]) : [...DEFAULT_CATEGORIES]
  } catch { return [...DEFAULT_CATEGORIES] }
}

function loadPhrases(): QPhrase[] {
  try {
    const raw = localStorage.getItem(PHRASE_KEY)
    return raw ? (JSON.parse(raw) as QPhrase[]) : [...DEFAULT_PHRASES]
  } catch { return [...DEFAULT_PHRASES] }
}

function persist(cats: QCategory[], phrases: QPhrase[]): void {
  localStorage.setItem(CAT_KEY,    JSON.stringify(cats))
  localStorage.setItem(PHRASE_KEY, JSON.stringify(phrases))
}

function genId(): string {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// ── Tipos internos ────────────────────────────────────────────────────────────

type PView = 'categories' | 'phrases' | 'phrase-form' | 'cat-form' | 'import-preview'

interface ImportRow {
  text: string
  categoryName: string
}

// ── Tela ──────────────────────────────────────────────────────────────────────

export class PhrasesScreen implements Screen {
  private el: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null

  private view: PView = 'categories'
  private categories: QCategory[] = []
  private phrases: QPhrase[] = []

  // Estado da navegação / formulário
  private activeCatId: string | null = null
  private editingPhrase: QPhrase | null = null
  private editingCat: QCategory | null = null
  private importRows: ImportRow[] = []

  mount(container: HTMLElement): void {
    this.injectStyles()
    this.categories = loadCategories()
    this.phrases    = loadPhrases()
    this.view       = 'categories'

    this.el = document.createElement('div')
    this.el.id = 'phrases-screen'
    this.el.className = 'ph-root'
    container.appendChild(this.el)
    this.render()
  }

  unmount(): void {
    this.el?.remove()
    this.el = null
    this.styleEl?.remove()
    this.styleEl = null
  }

  // ── Render dispatcher ─────────────────────────────────────────────────────

  private render(): void {
    if (!this.el) return
    switch (this.view) {
      case 'categories':    this.renderCategories();   break
      case 'phrases':       this.renderPhrases();      break
      case 'phrase-form':   this.renderPhraseForm();   break
      case 'cat-form':      this.renderCatForm();      break
      case 'import-preview':this.renderImportPreview();break
    }
  }

  // ── Vista: lista de categorias ────────────────────────────────────────────

  private renderCategories(): void {
    if (!this.el) return

    const rows = this.categories.length === 0
      ? `<div class="ph-empty">Nenhuma categoria. Clique em <strong>+ Nova Categoria</strong> para começar.</div>`
      : this.categories.map(cat => {
          const count = this.phrases.filter(p => p.categoryId === cat.id).length
          return `
            <div class="ph-row" data-catid="${cat.id}">
              <div class="ph-row-left">
                <span class="ph-row-icon">${cat.icon}</span>
                <div>
                  <div class="ph-row-name">${this.esc(cat.name)}</div>
                  <div class="ph-row-meta">${count} frase${count !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div class="ph-row-actions">
                <button class="ph-btn ph-btn--sm ph-btn--primary" data-action="open-cat" data-catid="${cat.id}">Ver frases</button>
                <button class="ph-btn ph-btn--sm ph-btn--ghost"   data-action="rename-cat" data-catid="${cat.id}">Renomear</button>
                <button class="ph-btn ph-btn--sm ph-btn--danger"  data-action="delete-cat" data-catid="${cat.id}">Excluir</button>
              </div>
            </div>`
        }).join('')

    this.el.innerHTML = `
      <div class="ph-page">
        <div class="ph-header">
          <div>
            <h1 class="ph-title">Gerenciamento de Frases</h1>
            <p class="ph-subtitle">Crie e organize categorias e frases para o usuário.</p>
          </div>
          <div class="ph-header-actions">
            <button class="ph-btn ph-btn--ghost" id="ph-restore">↺ Restaurar padrões PT-BR</button>
            <label class="ph-btn ph-btn--ghost ph-import-label">
              ↓ Importar
              <input type="file" accept=".txt,.csv" class="ph-import-input" id="ph-import-file">
            </label>
            <button class="ph-btn ph-btn--ghost" id="ph-export">↑ Exportar CSV</button>
            <button class="ph-btn ph-btn--primary" id="ph-new-cat">+ Nova Categoria</button>
          </div>
        </div>

        <div class="ph-list">${rows}</div>

        <div class="ph-footer">
          <button class="ph-btn ph-btn--ghost" id="ph-back">← Voltar para Home</button>
        </div>
      </div>
    `

    this.el.querySelector('#ph-new-cat')?.addEventListener('click', () => {
      this.editingCat = null
      this.view = 'cat-form'
      this.render()
    })

    this.el.querySelector('#ph-restore')?.addEventListener('click', () => {
      this.restoreDefaults()
    })

    this.el.querySelector('#ph-export')?.addEventListener('click', () => {
      this.exportCSV()
    })

    this.el.querySelector('#ph-import-file')?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) this.parseImport(file)
    })

    this.el.querySelector('#ph-back')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('irisflow:navigate', { detail: { route: 'home' } }))
    })

    this.el.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset['action']
        const catId  = btn.dataset['catid'] ?? ''
        const cat    = this.categories.find(c => c.id === catId)
        if (!cat) return

        if (action === 'open-cat') {
          this.activeCatId = catId
          this.view = 'phrases'
          this.render()
        } else if (action === 'rename-cat') {
          this.editingCat = cat
          this.view = 'cat-form'
          this.render()
        } else if (action === 'delete-cat') {
          if (!confirm(`Excluir a categoria "${cat.name}" e todas as suas frases?`)) return
          this.categories = this.categories.filter(c => c.id !== catId)
          this.phrases    = this.phrases.filter(p => p.categoryId !== catId)
          persist(this.categories, this.phrases)
          this.render()
        }
      })
    })
  }

  // ── Vista: frases de uma categoria ───────────────────────────────────────

  private renderPhrases(): void {
    if (!this.el) return
    const cat     = this.categories.find(c => c.id === this.activeCatId)
    const phrases = this.phrases.filter(p => p.categoryId === this.activeCatId)

    const rows = phrases.length === 0
      ? `<div class="ph-empty">Nenhuma frase nesta categoria. Clique em <strong>+ Nova Frase</strong> para adicionar.</div>`
      : phrases.map((p, i) => `
          <div class="ph-row ph-row--phrase" data-phrid="${p.id}">
            <div class="ph-row-left">
              <span class="ph-phrase-text">${this.esc(p.text)}</span>
            </div>
            <div class="ph-row-actions">
              <button class="ph-btn ph-btn--sm ph-btn--ghost ph-ord" data-action="move-up"   data-idx="${i}" ${i === 0 ? 'disabled' : ''} title="Subir">⬆</button>
              <button class="ph-btn ph-btn--sm ph-btn--ghost ph-ord" data-action="move-down" data-idx="${i}" ${i === phrases.length - 1 ? 'disabled' : ''} title="Descer">⬇</button>
              <button class="ph-btn ph-btn--sm ph-btn--ghost" data-action="edit-phrase"   data-phrid="${p.id}">Editar</button>
              <button class="ph-btn ph-btn--sm ph-btn--danger" data-action="delete-phrase" data-phrid="${p.id}">Excluir</button>
            </div>
          </div>
        `).join('')

    this.el.innerHTML = `
      <div class="ph-page">
        <div class="ph-header">
          <div>
            <h1 class="ph-title">${cat ? this.esc(cat.icon) + ' ' + this.esc(cat.name) : 'Frases'}</h1>
            <p class="ph-subtitle">${phrases.length} frase${phrases.length !== 1 ? 's' : ''} nesta categoria.</p>
          </div>
          <div class="ph-header-actions">
            <button class="ph-btn ph-btn--primary" id="ph-new-phrase">+ Nova Frase</button>
          </div>
        </div>

        <div class="ph-list">${rows}</div>

        <div class="ph-footer">
          <button class="ph-btn ph-btn--ghost" id="ph-back-cats">← Categorias</button>
        </div>
      </div>
    `

    this.el.querySelector('#ph-new-phrase')?.addEventListener('click', () => {
      this.editingPhrase = null
      this.view = 'phrase-form'
      this.render()
    })

    this.el.querySelector('#ph-back-cats')?.addEventListener('click', () => {
      this.view = 'categories'
      this.render()
    })

    this.el.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset['action']
        const phrid  = btn.dataset['phrid'] ?? ''
        const idx    = parseInt(btn.dataset['idx'] ?? '-1')

        if (action === 'edit-phrase') {
          const p = this.phrases.find(x => x.id === phrid)
          if (p) { this.editingPhrase = p; this.view = 'phrase-form'; this.render() }
        } else if (action === 'delete-phrase') {
          this.phrases = this.phrases.filter(p => p.id !== phrid)
          persist(this.categories, this.phrases)
          this.render()
        } else if (action === 'move-up' && idx > 0) {
          this.swapPhrases(phrases, idx, idx - 1)
        } else if (action === 'move-down' && idx < phrases.length - 1) {
          this.swapPhrases(phrases, idx, idx + 1)
        }
      })
    })
  }

  private swapPhrases(catPhrases: QPhrase[], i: number, j: number): void {
    const a = catPhrases[i]!
    const b = catPhrases[j]!
    const ia = this.phrases.indexOf(a)
    const ib = this.phrases.indexOf(b)
    ;[this.phrases[ia], this.phrases[ib]] = [this.phrases[ib]!, this.phrases[ia]!]
    persist(this.categories, this.phrases)
    this.render()
  }

  // ── Vista: formulário de frase ────────────────────────────────────────────

  private renderPhraseForm(): void {
    if (!this.el) return
    const isEdit = this.editingPhrase !== null
    const p      = this.editingPhrase

    const catOptions = this.categories.map(c =>
      `<option value="${c.id}" ${(p?.categoryId ?? this.activeCatId) === c.id ? 'selected' : ''}>${this.esc(c.name)}</option>`
    ).join('')

    this.el.innerHTML = `
      <div class="ph-page">
        <div class="ph-header">
          <h1 class="ph-title">${isEdit ? 'Editar Frase' : 'Nova Frase'}</h1>
        </div>
        <div class="ph-form-card">
          <div class="ph-field">
            <label class="ph-label" for="pf-text">Texto da frase *</label>
            <textarea class="ph-textarea" id="pf-text" rows="3" maxlength="200" placeholder="Ex: Quero água">${isEdit ? this.esc(p!.text) : ''}</textarea>
          </div>
          <div class="ph-field">
            <label class="ph-label" for="pf-cat">Categoria *</label>
            <select class="ph-select" id="pf-cat">${catOptions}</select>
          </div>
          <div class="ph-form-actions">
            <button class="ph-btn ph-btn--primary" id="pf-save">${isEdit ? 'Salvar alterações' : 'Criar Frase'}</button>
            <button class="ph-btn ph-btn--ghost"   id="pf-cancel">Cancelar</button>
          </div>
        </div>
      </div>
    `

    this.el.querySelector('#pf-cancel')?.addEventListener('click', () => {
      this.view = this.activeCatId ? 'phrases' : 'categories'
      this.render()
    })

    this.el.querySelector('#pf-save')?.addEventListener('click', () => {
      const text  = (this.el!.querySelector('#pf-text') as HTMLTextAreaElement).value.trim()
      const catId = (this.el!.querySelector('#pf-cat')  as HTMLSelectElement).value

      if (!text) {
        const ta = this.el!.querySelector('#pf-text') as HTMLTextAreaElement
        ta.focus(); ta.style.borderColor = '#ff5555'
        return
      }

      if (isEdit && p) {
        const idx = this.phrases.findIndex(x => x.id === p.id)
        if (idx !== -1) this.phrases[idx] = { ...p, text, categoryId: catId }
      } else {
        this.phrases.push({ id: genId(), text, categoryId: catId })
      }

      persist(this.categories, this.phrases)
      this.activeCatId = catId
      this.view = 'phrases'
      this.render()
      this.showToast(isEdit ? 'Frase atualizada.' : 'Frase criada.')
    })
  }

  // ── Vista: formulário de categoria ────────────────────────────────────────

  private renderCatForm(): void {
    if (!this.el) return
    const isEdit = this.editingCat !== null
    const c      = this.editingCat

    this.el.innerHTML = `
      <div class="ph-page">
        <div class="ph-header">
          <h1 class="ph-title">${isEdit ? 'Renomear Categoria' : 'Nova Categoria'}</h1>
        </div>
        <div class="ph-form-card">
          <div class="ph-field">
            <label class="ph-label" for="cf-name">Nome da categoria *</label>
            <input class="ph-input" id="cf-name" type="text" maxlength="40"
              placeholder="Ex: Trabalho" value="${isEdit ? this.esc(c!.name) : ''}" autocomplete="off">
          </div>
          <div class="ph-field">
            <label class="ph-label" for="cf-icon">Emoji / ícone</label>
            <input class="ph-input" id="cf-icon" type="text" maxlength="4"
              placeholder="Ex: 💼" value="${isEdit ? this.esc(c!.icon) : '📁'}" autocomplete="off">
          </div>
          <div class="ph-form-actions">
            <button class="ph-btn ph-btn--primary" id="cf-save">${isEdit ? 'Salvar' : 'Criar Categoria'}</button>
            <button class="ph-btn ph-btn--ghost"   id="cf-cancel">Cancelar</button>
          </div>
        </div>
      </div>
    `

    this.el.querySelector('#cf-cancel')?.addEventListener('click', () => {
      this.view = 'categories'
      this.render()
    })

    this.el.querySelector('#cf-save')?.addEventListener('click', () => {
      const name = (this.el!.querySelector('#cf-name') as HTMLInputElement).value.trim()
      const icon = (this.el!.querySelector('#cf-icon') as HTMLInputElement).value.trim() || '📁'

      if (!name) {
        const inp = this.el!.querySelector('#cf-name') as HTMLInputElement
        inp.focus(); inp.style.borderColor = '#ff5555'
        return
      }

      if (isEdit && c) {
        const idx = this.categories.findIndex(x => x.id === c.id)
        if (idx !== -1) this.categories[idx] = { ...c, name, icon }
      } else {
        this.categories.push({ id: genId(), name, icon })
      }

      persist(this.categories, this.phrases)
      this.view = 'categories'
      this.render()
      this.showToast(isEdit ? 'Categoria renomeada.' : 'Categoria criada.')
    })
  }

  // ── Vista: preview de importação ──────────────────────────────────────────

  private renderImportPreview(): void {
    if (!this.el) return
    const rows = this.importRows

    const preview = rows.slice(0, 20).map((r, i) =>
      `<div class="ph-import-row">
        <span class="ph-import-idx">${i + 1}</span>
        <span class="ph-import-text">${this.esc(r.text)}</span>
        <span class="ph-import-cat">${this.esc(r.categoryName)}</span>
      </div>`
    ).join('')

    this.el.innerHTML = `
      <div class="ph-page">
        <div class="ph-header">
          <h1 class="ph-title">Preview de Importação</h1>
          <p class="ph-subtitle">${rows.length} frases detectadas${rows.length > 20 ? ' (mostrando primeiras 20)' : ''}.</p>
        </div>
        <div class="ph-import-preview">
          <div class="ph-import-header">
            <span>Texto</span><span>Categoria</span>
          </div>
          ${preview}
        </div>
        <div class="ph-footer" style="gap:12px">
          <button class="ph-btn ph-btn--primary" id="ph-confirm-import">Importar ${rows.length} frases</button>
          <button class="ph-btn ph-btn--ghost"   id="ph-cancel-import">Cancelar</button>
        </div>
      </div>
    `

    this.el.querySelector('#ph-cancel-import')?.addEventListener('click', () => {
      this.importRows = []
      this.view = 'categories'
      this.render()
    })

    this.el.querySelector('#ph-confirm-import')?.addEventListener('click', () => {
      this.commitImport()
    })
  }

  // ── Lógica de importação ──────────────────────────────────────────────────

  private parseImport(file: File): void {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? ''
      const rows: ImportRow[] = []

      if (file.name.endsWith('.csv')) {
        for (const line of text.split(/\r?\n/)) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const [phraseText, catName] = trimmed.split(',').map(s => s.replace(/^"|"$/g, '').trim())
          if (phraseText) rows.push({ text: phraseText, categoryName: catName?.trim() || 'Importadas' })
        }
      } else {
        // .txt — uma frase por linha
        for (const line of text.split(/\r?\n/)) {
          const trimmed = line.trim()
          if (trimmed) rows.push({ text: trimmed, categoryName: 'Importadas' })
        }
      }

      if (rows.length === 0) {
        this.showToast('Nenhuma frase encontrada no arquivo.', true)
        return
      }

      this.importRows = rows
      this.view = 'import-preview'
      this.render()
    }
    reader.readAsText(file, 'utf-8')
  }

  private commitImport(): void {
    const newCats = new Map<string, string>() // name → id

    for (const row of this.importRows) {
      const catName = row.categoryName
      if (!newCats.has(catName)) {
        let cat = this.categories.find(c => c.name.toLowerCase() === catName.toLowerCase())
        if (!cat) {
          cat = { id: genId(), name: catName, icon: '📁' }
          this.categories.push(cat)
        }
        newCats.set(catName, cat.id)
      }
      const catId = newCats.get(catName)!
      this.phrases.push({ id: genId(), text: row.text, categoryId: catId })
    }

    persist(this.categories, this.phrases)
    this.importRows = []
    this.view = 'categories'
    this.render()
    this.showToast(`${this.importRows.length || 'Frases'} importadas com sucesso.`)
  }

  // ── Export CSV ────────────────────────────────────────────────────────────

  private exportCSV(): void {
    const lines = ['frase,categoria']
    for (const p of this.phrases) {
      const cat = this.categories.find(c => c.id === p.categoryId)
      const catName = cat?.name ?? 'Sem categoria'
      lines.push(`"${p.text.replace(/"/g, '""')}","${catName.replace(/"/g, '""')}"`)
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'irisflow-frases.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Restaurar padrões ─────────────────────────────────────────────────────

  private restoreDefaults(): void {
    const existingIds = new Set(this.phrases.map(p => p.id))
    const existingCatIds = new Set(this.categories.map(c => c.id))

    for (const cat of DEFAULT_CATEGORIES) {
      if (!existingCatIds.has(cat.id)) this.categories.push({ ...cat })
    }
    for (const phrase of DEFAULT_PHRASES) {
      if (!existingIds.has(phrase.id)) this.phrases.push({ ...phrase })
    }

    persist(this.categories, this.phrases)
    this.render()
    this.showToast('Frases padrão PT-BR restauradas sem apagar as customizadas.')
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  private showToast(msg: string, error = false): void {
    const t = document.createElement('div')
    t.className = 'ph-toast' + (error ? ' ph-toast--error' : '')
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 3500)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  // ── Estilos ───────────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById('ph-styles')) return
    this.styleEl = document.createElement('style')
    this.styleEl.id = 'ph-styles'
    this.styleEl.textContent = `
      .ph-root {
        display: flex; align-items: flex-start; justify-content: center;
        min-height: 100%; width: 100%;
        background: #0D0D0D; color: #e0e0e0;
        font-family: system-ui, -apple-system, sans-serif;
        overflow-y: auto; padding: 32px 16px 48px; box-sizing: border-box;
      }
      .ph-page {
        width: 100%; max-width: 820px;
        display: flex; flex-direction: column; gap: 24px;
      }
      .ph-header {
        display: flex; align-items: flex-start;
        justify-content: space-between; gap: 16px; flex-wrap: wrap;
      }
      .ph-header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .ph-title    { margin: 0; font-size: 26px; font-weight: 700; color: #fff; }
      .ph-subtitle { margin: 6px 0 0; font-size: 15px; color: #666; line-height: 1.5; }

      /* Buttons */
      .ph-btn {
        padding: 9px 16px; border-radius: 8px; border: none;
        font-size: 13px; font-weight: 600; cursor: pointer;
        font-family: inherit; transition: opacity 0.15s, transform 0.1s;
        white-space: nowrap;
      }
      .ph-btn:hover { opacity: 0.85; transform: translateY(-1px); }
      .ph-btn:active { transform: translateY(0); opacity: 0.7; }
      .ph-btn:disabled { opacity: 0.3; cursor: default; transform: none; }
      .ph-btn--primary { background: #00fff7; color: #0a0a0a; }
      .ph-btn--ghost   { background: #1e1e1e; color: #ccc; border: 1px solid #2a2a2a; }
      .ph-btn--danger  { background: #2a1010; color: #ff8888; border: 1px solid #ff444440; }
      .ph-btn--sm { padding: 6px 11px; font-size: 12px; }

      /* Import file */
      .ph-import-label { display: inline-flex; align-items: center; cursor: pointer; }
      .ph-import-input { display: none; }

      /* List */
      .ph-list { display: flex; flex-direction: column; gap: 8px; }
      .ph-empty {
        padding: 36px 24px; text-align: center; color: #555;
        border: 1px dashed #2a2a2a; border-radius: 12px; font-size: 15px;
      }
      .ph-row {
        display: flex; align-items: center; gap: 16px;
        background: #141414; border: 1px solid #1e1e1e; border-radius: 10px;
        padding: 14px 18px; transition: border-color 0.15s;
      }
      .ph-row:hover { border-color: #2a2a2a; }
      .ph-row-left {
        flex: 1; display: flex; align-items: center; gap: 14px; min-width: 0;
      }
      .ph-row-icon  { font-size: 28px; flex-shrink: 0; }
      .ph-row-name  { font-size: 16px; font-weight: 600; color: #e0e0e0; }
      .ph-row-meta  { font-size: 13px; color: #555; margin-top: 2px; }
      .ph-row-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
      .ph-row--phrase .ph-phrase-text {
        font-size: 15px; color: #ccc; flex: 1;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .ph-ord { min-width: 32px; text-align: center; }

      /* Form */
      .ph-form-card {
        background: #141414; border: 1px solid #222; border-radius: 14px;
        padding: 28px; display: flex; flex-direction: column; gap: 20px;
        max-width: 560px;
      }
      .ph-field { display: flex; flex-direction: column; gap: 8px; }
      .ph-label { font-size: 14px; font-weight: 500; color: #aaa; }
      .ph-input, .ph-textarea, .ph-select {
        background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 8px;
        color: #e0e0e0; font-size: 15px; padding: 10px 14px;
        font-family: inherit; outline: none; box-sizing: border-box; width: 100%;
        transition: border-color 0.15s;
      }
      .ph-input:focus, .ph-textarea:focus, .ph-select:focus { border-color: #00fff770; }
      .ph-textarea { resize: vertical; min-height: 72px; }
      .ph-form-actions { display: flex; gap: 12px; }

      /* Import preview */
      .ph-import-preview {
        background: #141414; border: 1px solid #222; border-radius: 10px;
        overflow: hidden; max-height: 400px; overflow-y: auto;
      }
      .ph-import-header {
        display: grid; grid-template-columns: 1fr 180px;
        padding: 10px 16px; background: #0a0a0a;
        font-size: 12px; font-weight: 700; color: #555;
        text-transform: uppercase; letter-spacing: 0.5px;
        border-bottom: 1px solid #1e1e1e; position: sticky; top: 0;
      }
      .ph-import-row {
        display: grid; grid-template-columns: 32px 1fr 180px;
        padding: 10px 16px; border-bottom: 1px solid #1a1a1a;
        font-size: 14px; gap: 12px; align-items: center;
      }
      .ph-import-row:last-child { border-bottom: none; }
      .ph-import-idx  { color: #444; font-size: 12px; text-align: right; }
      .ph-import-text { color: #ccc; }
      .ph-import-cat  { color: #00fff7; font-size: 13px; }

      /* Footer */
      .ph-footer { display: flex; gap: 12px; align-items: center; padding-top: 4px; }

      /* Toast */
      .ph-toast {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: #1a2a1a; border: 1px solid #00ff6650; color: #00ff88;
        padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 500;
        z-index: 99999; animation: ph-toast-in 0.2s ease; pointer-events: none;
      }
      .ph-toast--error {
        background: #2a1a1a; border-color: #ff444450; color: #ff9999;
      }
      @keyframes ph-toast-in {
        from { opacity: 0; transform: translateX(-50%) translateY(8px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    `
    document.head.appendChild(this.styleEl)
  }
}
