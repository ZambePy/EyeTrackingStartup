// Typed wrappers around the context-bridge APIs exposed by electron/preload.ts.
// Components import from here instead of accessing window.* directly.

export const ipc = window.irisflow;
export const sidecarIpc = window.sidecar;
