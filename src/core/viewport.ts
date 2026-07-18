// Uses clientWidth/Height (excludes scrollbar) for coordinates consistent with gaze predictions.
export function getViewport(): { w: number; h: number } {
  return {
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight,
  };
}
