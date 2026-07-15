// Helper único de viewport — usa clientWidth/Height em vez de innerWidth/Height
// para excluir a largura da scrollbar e garantir coordenadas consistentes (G8).
export function getViewport(): { w: number; h: number } {
  return {
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight,
  };
}
