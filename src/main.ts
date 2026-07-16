import './style.css'
import { GazeEngine } from './gaze/GazeEngine'
import { Router } from './shell/Router'
import { NavOverlay } from './shell/NavOverlay'
import { CaregiverNav } from './shell/CaregiverNav'
import { HomeScreen } from './screens/HomeScreen'
import { KeyboardScreen } from './screens/KeyboardScreen'
import { CalibrationScreen } from './screens/CalibrationScreen'
import { QuickPhrasesScreen } from './screens/QuickPhrasesScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { SettingsScreen, loadSettings, applySettings } from './screens/SettingsScreen'
import { PhrasesScreen } from './screens/PhrasesScreen'
import * as calibration from './calibration'
import { toggleSessionLog, exportSessionLog } from './sessionLog'

// Elementos do shell (gerenciados pelo GazeEngine)
const appRoot    = document.getElementById('app-root')!
const appShell   = document.getElementById('app')!
const video      = document.getElementById('webcam') as HTMLVideoElement
const canvas     = document.getElementById('output_canvas') as HTMLCanvasElement
const cursor     = document.getElementById('laser') as HTMLDivElement
const loadingEl  = document.getElementById('loading') as HTMLDivElement

// ── Aplica configurações persistidas antes de renderizar ──────────────────────
applySettings(loadSettings())

// ── Router ────────────────────────────────────────────────────────────────────
Router.init(appRoot)
Router.register('home',          new HomeScreen())
Router.register('keyboard',      new KeyboardScreen())
Router.register('calibration',   new CalibrationScreen())
Router.register('quick-phrases', new QuickPhrasesScreen())
Router.register('profile',       new ProfileScreen())
Router.register('settings',      new SettingsScreen())
Router.register('phrases',       new PhrasesScreen())

// ── Shell: NavOverlay (usuário) e CaregiverNav (cuidador) ────────────────────
NavOverlay.mount(appShell)
CaregiverNav.mount(appShell)

// ── Calibração: painel do cuidador (mantido do código existente) ──────────────
calibration.init()
calibration.addFilterControls(0.5, 0.007, (mc, b) => GazeEngine.applyFilterParams(mc, b))

// ── Aplica filtro em tempo real quando SettingsScreen ajusta os sliders ───────
document.addEventListener('irisflow:applyFilter', (e: Event) => {
  const { minCutoff, beta } = (e as CustomEvent<{ minCutoff: number; beta: number }>).detail
  GazeEngine.applyFilterParams(minCutoff, beta)
})

// ── GazeEngine: câmera + MediaPipe (100% local, sem CDN) ─────────────────────
GazeEngine.init(video, canvas, cursor, loadingEl).catch(err => {
  console.error('[IrisFlow] Falha ao inicializar GazeEngine:', err)
  loadingEl.textContent = 'Erro crítico. Verifique o console.'
  loadingEl.style.display = 'block'
})

// ── Atalhos de teclado: log de sessão (uso interno do cuidador) ───────────────
function setLogIndicator(active: boolean): void {
  let el = document.getElementById('log-indicator')
  if (!el) {
    el = document.createElement('div')
    el.id = 'log-indicator'
    el.className = 'log-indicator'
    document.body.appendChild(el)
  }
  el.textContent = '● REC'
  el.style.display = active ? 'block' : 'none'
}

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (e.code === 'KeyL') {
    const active = toggleSessionLog()
    setLogIndicator(active)
    console.info(`[IrisFlow] Log de sessão ${active ? 'iniciado' : 'pausado'}`)
  }
  if (e.code === 'KeyE') {
    exportSessionLog()
  }
})

// ── Iniciar na tela Home ──────────────────────────────────────────────────────
Router.navigate('home')
