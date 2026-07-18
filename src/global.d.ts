import type { SidecarStatus } from '../electron/sidecar';

export {};

declare global {
  interface Window {
    irisflow: {
      saveProfile:   (id: string, data: unknown) => Promise<void>;
      loadProfile:   (id: string) => Promise<unknown>;
      savePhrases:   (data: unknown) => Promise<void>;
      loadPhrases:   () => Promise<unknown>;
      exportLog:     (data: string) => Promise<string>;
      getAppVersion: () => Promise<string>;
      // E4 (Sprint E4): download personalised ONNX model to userData cache
      // downloadOnnx:  (profileId: string) => Promise<string>;
    };
    sidecar: {
      getStatus:      () => Promise<SidecarStatus>;
      onStatusChange: (cb: (status: string) => void) => () => void;
    };
  }
}
