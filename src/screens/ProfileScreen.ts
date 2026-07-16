import type { Screen } from '../shell/Router'

interface Profile {
  id: string
  name: string
  notes: string
  preferredCamera: string
  createdAt: string
  lastCalibration: string | null
  calibrated: boolean
}

const PROFILES_KEY = 'irisflow-profiles'
const ACTIVE_KEY   = 'irisflow-active-profile'

function loadProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    return raw ? (JSON.parse(raw) as Profile[]) : []
  } catch { return [] }
}

function saveProfiles(profiles: Profile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
  try {
    if (window.irisflow?.saveProfile) {
      window.irisflow.saveProfile('_profiles', profiles).catch(() => {})
    }
  } catch { /* IPC opcional */ }
}

function getActiveId(): string {
  return localStorage.getItem(ACTIVE_KEY) ?? ''
}

function setActiveId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
}

function generateId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── Serialização .irisflow (zip simulado como JSON base64) ────────────────────

function exportProfile(profile: Profile): void {
  const calibData = localStorage.getItem('calibrationProfile') ?? null
  const phrases   = localStorage.getItem(`phrases-${profile.id}`) ?? null
  const bundle = { profile, calibData, phrases, exportedAt: new Date().toISOString() }
  const json   = JSON.stringify(bundle, null, 2)
  const blob   = new Blob([json], { type: 'application/json' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = `${profile.name.replace(/\s+/g, '_')}.irisflow`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Tela ──────────────────────────────────────────────────────────────────────

export class ProfileScreen implements Screen {
  private el: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null
  private view: 'list' | 'new' | 'confirm-delete' = 'list'
  private pendingDelete: Profile | null = null

  mount(container: HTMLElement): void {
    this.injectStyles()
    this.el = document.createElement('div')
    this.el.id = 'profile-screen'
    this.el.className = 'ps-root'
    container.appendChild(this.el)
    this.view = 'list'
    this.render()
  }

  unmount(): void {
    this.el?.remove()
    this.el = null
    this.styleEl?.remove()
    this.styleEl = null
  }

  private render(): void {
    if (!this.el) return
    switch (this.view) {
      case 'list':           this.renderList();         break
      case 'new':            this.renderForm();         break
      case 'confirm-delete': this.renderConfirmDelete();break
    }
  }

  // ── Lista de perfis ────────────────────────────────────────────────────────

  private renderList(): void {
    if (!this.el) return
    const profiles  = loadProfiles()
    const activeId  = getActiveId()

    const rows = profiles.length === 0
      ? `<div class="ps-empty">Nenhum perfil cadastrado. Clique em <strong>+ Novo Perfil</strong> para começar.</div>`
      : profiles.map(p => `
        <div class="ps-card ${p.id === activeId ? 'ps-card--active' : ''}" data-id="${p.id}">
          <div class="ps-card-avatar">${p.name.charAt(0).toUpperCase()}</div>
          <div class="ps-card-info">
            <div class="ps-card-name">${this.esc(p.name)}</div>
            <div class="ps-card-meta">
              ${p.calibrated
                ? `<span class="ps-tag ps-tag--ok">✓ Calibrado</span>`
                : `<span class="ps-tag ps-tag--warn">⚠ Não calibrado</span>`}
              ${p.lastCalibration
                ? `<span class="ps-tag ps-tag--gray">Última calib.: ${new Date(p.lastCalibration).toLocaleDateString('pt-BR')}</span>`
                : ''}
            </div>
          </div>
          <div class="ps-card-actions">
            ${p.id !== activeId ? `<button class="ps-btn ps-btn--sm ps-btn--primary" data-action="select" data-id="${p.id}">Selecionar</button>` : `<span class="ps-active-badge">Ativo</span>`}
            <button class="ps-btn ps-btn--sm ps-btn--ghost" data-action="export" data-id="${p.id}" title="Exportar perfil">↑ Exportar</button>
            <button class="ps-btn ps-btn--sm ps-btn--danger" data-action="delete" data-id="${p.id}" title="Excluir perfil">✕</button>
          </div>
        </div>
      `).join('')

    this.el.innerHTML = `
      <div class="ps-page">
        <div class="ps-header">
          <div>
            <h1 class="ps-title">Perfis de Usuário</h1>
            <p class="ps-subtitle">Gerencie perfis de pacientes. Cada perfil mantém calibração e frases independentes.</p>
          </div>
          <div class="ps-header-actions">
            <label class="ps-btn ps-btn--ghost ps-import-label" title="Importar perfil .irisflow">
              ↓ Importar
              <input type="file" accept=".irisflow,.json" class="ps-import-input" id="ps-import-file">
            </label>
            <button class="ps-btn ps-btn--primary" id="ps-btn-new">+ Novo Perfil</button>
          </div>
        </div>
        <div class="ps-list">${rows}</div>
        <div class="ps-footer">
          <button class="ps-btn ps-btn--ghost" id="ps-btn-back">← Voltar para Home</button>
        </div>
      </div>
    `

    this.el.querySelector('#ps-btn-new')?.addEventListener('click', () => {
      this.view = 'new'
      this.render()
    })

    this.el.querySelector('#ps-btn-back')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('irisflow:navigate', { detail: { route: 'home' } }))
    })

    this.el.querySelector('#ps-import-file')?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) this.importProfile(file)
    })

    this.el.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset['action']
        const id     = btn.dataset['id'] ?? ''
        const all    = loadProfiles()
        const target = all.find(p => p.id === id)
        if (!target) return
        if (action === 'select') {
          setActiveId(id)
          this.render()
        } else if (action === 'export') {
          exportProfile(target)
        } else if (action === 'delete') {
          this.pendingDelete = target
          this.view = 'confirm-delete'
          this.render()
        }
      })
    })
  }

  // ── Formulário novo perfil ─────────────────────────────────────────────────

  private renderForm(): void {
    if (!this.el) return
    this.el.innerHTML = `
      <div class="ps-page">
        <div class="ps-header">
          <h1 class="ps-title">Novo Perfil</h1>
          <p class="ps-subtitle">Preencha os dados do novo paciente / usuário.</p>
        </div>
        <div class="ps-form-card">
          <div class="ps-field">
            <label class="ps-label" for="pf-name">Nome do paciente *</label>
            <input class="ps-input" id="pf-name" type="text" placeholder="Ex: João Silva" maxlength="60" autocomplete="off">
          </div>
          <div class="ps-field">
            <label class="ps-label" for="pf-camera">Câmera preferida</label>
            <input class="ps-input" id="pf-camera" type="text" placeholder="Ex: Logitech C920 (opcional)" maxlength="80" autocomplete="off">
          </div>
          <div class="ps-field">
            <label class="ps-label" for="pf-notes">Notas do cuidador</label>
            <textarea class="ps-textarea" id="pf-notes" rows="4" placeholder="Observações sobre posicionamento, ajustes especiais, etc." maxlength="500"></textarea>
          </div>
          <div class="ps-form-actions">
            <button class="ps-btn ps-btn--primary" id="pf-btn-save">Criar Perfil</button>
            <button class="ps-btn ps-btn--ghost" id="pf-btn-cancel">Cancelar</button>
          </div>
        </div>
      </div>
    `

    this.el.querySelector('#pf-btn-cancel')?.addEventListener('click', () => {
      this.view = 'list'
      this.render()
    })

    this.el.querySelector('#pf-btn-save')?.addEventListener('click', () => {
      const name   = (this.el!.querySelector('#pf-name')   as HTMLInputElement).value.trim()
      const camera = (this.el!.querySelector('#pf-camera') as HTMLInputElement).value.trim()
      const notes  = (this.el!.querySelector('#pf-notes')  as HTMLTextAreaElement).value.trim()

      if (!name) {
        const inp = this.el!.querySelector('#pf-name') as HTMLInputElement
        inp.focus()
        inp.style.borderColor = '#ff5555'
        return
      }

      const newProfile: Profile = {
        id:              generateId(),
        name,
        notes,
        preferredCamera: camera,
        createdAt:       new Date().toISOString(),
        lastCalibration: null,
        calibrated:      false,
      }

      const all = loadProfiles()
      all.push(newProfile)
      saveProfiles(all)

      if (!getActiveId()) setActiveId(newProfile.id)

      this.view = 'list'
      this.render()
    })
  }

  // ── Confirmação de exclusão ────────────────────────────────────────────────

  private renderConfirmDelete(): void {
    if (!this.el || !this.pendingDelete) return
    const p = this.pendingDelete

    this.el.innerHTML = `
      <div class="ps-page">
        <div class="ps-delete-modal">
          <div class="ps-delete-icon">⚠</div>
          <h2 class="ps-delete-title">Excluir perfil?</h2>
          <p class="ps-delete-desc">Esta ação é <strong>irreversível</strong>. Calibração, frases e histórico de <strong>${this.esc(p.name)}</strong> serão permanentemente removidos.</p>
          <p class="ps-delete-confirm-label">Digite o nome do perfil para confirmar:</p>
          <input class="ps-input" id="ps-del-name" type="text" placeholder="${this.esc(p.name)}" autocomplete="off">
          <div class="ps-delete-actions">
            <button class="ps-btn ps-btn--danger" id="ps-del-confirm" disabled>Excluir permanentemente</button>
            <button class="ps-btn ps-btn--ghost" id="ps-del-cancel">Cancelar</button>
          </div>
        </div>
      </div>
    `

    const input   = this.el.querySelector('#ps-del-name')   as HTMLInputElement
    const confirm = this.el.querySelector('#ps-del-confirm') as HTMLButtonElement

    input.addEventListener('input', () => {
      confirm.disabled = input.value.trim() !== p.name
    })

    this.el.querySelector('#ps-del-cancel')?.addEventListener('click', () => {
      this.pendingDelete = null
      this.view = 'list'
      this.render()
    })

    confirm.addEventListener('click', () => {
      if (!this.pendingDelete) return
      const all     = loadProfiles().filter(x => x.id !== this.pendingDelete!.id)
      saveProfiles(all)
      if (getActiveId() === this.pendingDelete.id) {
        setActiveId(all[0]?.id ?? '')
      }
      this.pendingDelete = null
      this.view = 'list'
      this.render()
    })
  }

  // ── Import .irisflow ──────────────────────────────────────────────────────

  private importProfile(file: File): void {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const bundle = JSON.parse(e.target?.result as string) as {
          profile: Profile
          calibData: string | null
          phrases: string | null
        }
        if (!bundle?.profile?.name) throw new Error('Arquivo inválido')

        const imported: Profile = {
          ...bundle.profile,
          id: generateId(),
          createdAt: new Date().toISOString(),
        }

        const all = loadProfiles()
        all.push(imported)
        saveProfiles(all)

        if (bundle.calibData) {
          localStorage.setItem('calibrationProfile', bundle.calibData)
        }
        if (bundle.phrases) {
          localStorage.setItem(`phrases-${imported.id}`, bundle.phrases)
        }

        this.render()
        this.showToast(`Perfil "${imported.name}" importado com sucesso.`)
      } catch (err) {
        this.showToast('Erro ao importar: arquivo .irisflow inválido.', true)
        console.error('[ProfileScreen] Import error:', err)
      }
    }
    reader.readAsText(file)
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  private showToast(msg: string, error = false): void {
    const t = document.createElement('div')
    t.className = 'ps-toast' + (error ? ' ps-toast--error' : '')
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
    if (document.getElementById('ps-styles')) return
    this.styleEl = document.createElement('style')
    this.styleEl.id = 'ps-styles'
    this.styleEl.textContent = `
      .ps-root {
        display: flex; align-items: flex-start; justify-content: center;
        min-height: 100%; width: 100%;
        background: #0D0D0D; color: #e0e0e0;
        font-family: system-ui, -apple-system, sans-serif;
        overflow-y: auto; padding: 32px 16px; box-sizing: border-box;
      }
      .ps-page {
        width: 100%; max-width: 760px;
        display: flex; flex-direction: column; gap: 24px;
      }
      .ps-header {
        display: flex; align-items: flex-start;
        justify-content: space-between; gap: 16px; flex-wrap: wrap;
      }
      .ps-header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .ps-title { margin: 0; font-size: 26px; font-weight: 700; color: #fff; }
      .ps-subtitle { margin: 6px 0 0; font-size: 15px; color: #777; line-height: 1.5; }

      /* Buttons */
      .ps-btn {
        padding: 10px 18px; border-radius: 8px; border: none;
        font-size: 14px; font-weight: 600; cursor: pointer;
        font-family: inherit; transition: opacity 0.15s, transform 0.1s;
        white-space: nowrap;
      }
      .ps-btn:hover { opacity: 0.85; transform: translateY(-1px); }
      .ps-btn:active { transform: translateY(0); opacity: 0.7; }
      .ps-btn--primary { background: #00fff7; color: #0a0a0a; }
      .ps-btn--ghost { background: #1e1e1e; color: #ccc; border: 1px solid #333; }
      .ps-btn--danger { background: #3a1010; color: #ff6b6b; border: 1px solid #ff4444; }
      .ps-btn--sm { padding: 7px 13px; font-size: 13px; }

      /* Import file input */
      .ps-import-label {
        display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
      }
      .ps-import-input { display: none; }

      /* Profile cards */
      .ps-list { display: flex; flex-direction: column; gap: 12px; }
      .ps-empty {
        padding: 40px 24px; text-align: center; color: #555;
        border: 1px dashed #2a2a2a; border-radius: 12px; font-size: 15px;
      }
      .ps-card {
        display: flex; align-items: center; gap: 16px;
        background: #141414; border: 1px solid #222; border-radius: 12px;
        padding: 16px 20px; transition: border-color 0.15s;
      }
      .ps-card:hover { border-color: #333; }
      .ps-card--active { border-color: #00fff750; background: #0a1a1a; }
      .ps-card-avatar {
        width: 48px; height: 48px; border-radius: 50%;
        background: #00fff720; border: 2px solid #00fff740;
        color: #00fff7; font-size: 20px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .ps-card-info { flex: 1; min-width: 0; }
      .ps-card-name { font-size: 17px; font-weight: 600; color: #fff; margin-bottom: 6px; }
      .ps-card-meta { display: flex; gap: 8px; flex-wrap: wrap; }
      .ps-tag {
        font-size: 12px; padding: 3px 9px; border-radius: 20px; font-weight: 500;
      }
      .ps-tag--ok   { background: #00ff6615; border: 1px solid #00ff6650; color: #00ff88; }
      .ps-tag--warn { background: #ffaa0015; border: 1px solid #ffaa0050; color: #ffbb33; }
      .ps-tag--gray { background: #1e1e1e; border: 1px solid #333; color: #888; }
      .ps-card-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; flex-shrink: 0; }
      .ps-active-badge {
        font-size: 13px; font-weight: 600; color: #00fff7;
        background: #00fff715; border: 1px solid #00fff740;
        padding: 6px 12px; border-radius: 20px;
      }

      /* Form */
      .ps-form-card {
        background: #141414; border: 1px solid #222; border-radius: 14px;
        padding: 28px; display: flex; flex-direction: column; gap: 20px;
      }
      .ps-field { display: flex; flex-direction: column; gap: 8px; }
      .ps-label { font-size: 14px; font-weight: 500; color: #aaa; }
      .ps-input, .ps-textarea {
        background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 8px;
        color: #e0e0e0; font-size: 15px; padding: 10px 14px;
        font-family: inherit; outline: none; box-sizing: border-box; width: 100%;
        transition: border-color 0.15s;
      }
      .ps-input:focus, .ps-textarea:focus { border-color: #00fff770; }
      .ps-textarea { resize: vertical; min-height: 80px; }
      .ps-form-actions { display: flex; gap: 12px; }

      /* Delete confirm */
      .ps-delete-modal {
        background: #141414; border: 1px solid #3a1010;
        border-radius: 16px; padding: 36px 32px;
        display: flex; flex-direction: column; gap: 16px;
        align-items: center; text-align: center; max-width: 480px; margin: 0 auto;
      }
      .ps-delete-icon {
        font-size: 48px; width: 72px; height: 72px;
        display: flex; align-items: center; justify-content: center;
        background: #2a100a; border: 2px solid #ff4444;
        border-radius: 50%; color: #ff6b6b;
      }
      .ps-delete-title { margin: 0; font-size: 22px; font-weight: 700; color: #ff6b6b; }
      .ps-delete-desc { margin: 0; font-size: 15px; color: #aaa; line-height: 1.6; }
      .ps-delete-confirm-label { margin: 0; font-size: 14px; color: #777; }
      .ps-delete-actions { display: flex; flex-direction: column; gap: 10px; width: 100%; }
      .ps-btn--danger:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }

      /* Footer */
      .ps-footer { padding-top: 8px; }

      /* Toast */
      .ps-toast {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: #1a2a1a; border: 1px solid #00ff6650; color: #00ff88;
        padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 500;
        z-index: 99999; animation: ps-toast-in 0.2s ease;
      }
      .ps-toast--error {
        background: #2a1a1a; border-color: #ff444450; color: #ff8888;
      }
      @keyframes ps-toast-in {
        from { opacity: 0; transform: translateX(-50%) translateY(8px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    `
    document.head.appendChild(this.styleEl)
  }
}
