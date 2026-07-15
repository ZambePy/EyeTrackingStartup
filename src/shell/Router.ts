export interface Screen {
  mount(container: HTMLElement): void
  unmount(): void
}

type NavigateCallback = (route: string) => void

class RouterImpl {
  private screens = new Map<string, Screen>()
  private currentRoute = ''
  private container: HTMLElement | null = null
  private navigateCallbacks: NavigateCallback[] = []

  init(container: HTMLElement): void {
    this.container = container
    // Escuta eventos de navegação disparados pelo DwellManager
    document.addEventListener('irisflow:navigate', (e: Event) => {
      const route = (e as CustomEvent<{ route: string }>).detail.route
      this.navigate(route)
    })
  }

  register(route: string, screen: Screen): void {
    this.screens.set(route, screen)
  }

  navigate(route: string): void {
    if (!this.container) return
    if (this.currentRoute === route) return

    const prev = this.screens.get(this.currentRoute)
    if (prev) {
      prev.unmount()
      this.container.innerHTML = ''
    }

    const next = this.screens.get(route)
    if (!next) {
      console.warn(`[Router] Rota desconhecida: ${route}`)
      return
    }

    this.currentRoute = route
    next.mount(this.container)
    this.navigateCallbacks.forEach(cb => cb(route))
  }

  onNavigate(cb: NavigateCallback): void {
    this.navigateCallbacks.push(cb)
  }

  getCurrentRoute(): string {
    return this.currentRoute
  }
}

export const Router = new RouterImpl()
