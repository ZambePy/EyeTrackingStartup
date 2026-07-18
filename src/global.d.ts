export {}

declare global {
  interface Window {
    irisflow?: {
      saveProfile:   (id: string, data: unknown) => Promise<void>
      loadProfile:   (id: string) => Promise<unknown>
      savePhrases:   (data: unknown) => Promise<void>
      loadPhrases:   () => Promise<unknown>
      exportLog:     (data: string) => Promise<string>
      getAppVersion: () => Promise<string>
    }
    sidecar?: {
      getStatus:      () => Promise<'stopped' | 'starting' | 'ready' | 'error'>
      onStatusChange: (cb: (status: string) => void) => () => void
    }
  }
}
