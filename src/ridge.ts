// Regressão Ridge Múltipla Linear
// Sistema normal regularizado: (ΦᵀΦ + λI) β = Φᵀy
// Sprint 3: predictRidge retorna coords normalizadas (sem clamp, sem viewport);
//           findBestLambda seleciona λ via LOO-CV fórmula fechada (G6).

export interface RidgeModel {
  betaX: number[];
  betaY: number[];
  numFeatures: number;
}

// Eliminação gaussiana com pivotação parcial — resolve A·β = b
function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const d = M[col][col];
    if (Math.abs(d) < 1e-12) continue;
    for (let j = col; j <= n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }

  return M.map(row => row[n]);
}

// Inversão Gauss-Jordan: [A | I] → [I | A⁻¹]
function invertMatrix(A: number[][]): number[][] {
  const n = A.length;
  const M: number[][] = A.map((row, i) => {
    const aug = new Array(2 * n).fill(0.0);
    for (let j = 0; j < n; j++) aug[j] = row[j];
    aug[n + i] = 1.0;
    return aug;
  });

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const d = M[col][col];
    if (Math.abs(d) < 1e-12) continue;
    const invD = 1.0 / d;
    for (let j = 0; j < 2 * n; j++) M[col][j] *= invD;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[col][j];
    }
  }

  return M.map(row => row.slice(n));
}

// MSE de LOO-CV usando a fórmula fechada:
//   LOO_i = (y_i − ŷ_i) / (1 − H_ii)
//   H_ii  = ϕ_i · (ΦᵀΦ + λI)⁻¹ · ϕ_i
// Φ já inclui a coluna de bias (índice 0); λ não regulariza o bias.
function looMSE(
  Phi: number[][],
  PhiTPhi: number[][],
  bVec: number[],
  targets: number[],
  lambda: number
): number {
  const m = Phi.length;
  const nf = Phi[0].length;

  // A = ΦᵀΦ + λI (skip bias em [0,0])
  const A = PhiTPhi.map((row, i) =>
    row.map((v, j) => v + (i === j && i > 0 ? lambda : 0))
  );

  // C = A⁻¹
  const C = invertMatrix(A);

  // β = C · bVec
  const beta = new Array(nf).fill(0.0);
  for (let i = 0; i < nf; i++) {
    for (let j = 0; j < nf; j++) beta[i] += C[i][j] * bVec[j];
  }

  // ŷ = Φ · β
  const yhat = new Array(m).fill(0.0);
  for (let k = 0; k < m; k++) {
    for (let i = 0; i < nf; i++) yhat[k] += Phi[k][i] * beta[i];
  }

  // B = C · Φᵀ  (nf × m) para cálculo eficiente da diagonal de H
  const B: number[][] = Array.from({ length: nf }, () => new Array(m).fill(0.0));
  for (let a = 0; a < nf; a++) {
    for (let b = 0; b < nf; b++) {
      const cab = C[a][b];
      if (Math.abs(cab) < 1e-15) continue;
      for (let i = 0; i < m; i++) B[a][i] += cab * Phi[i][b];
    }
  }

  // LOO error
  let err = 0.0;
  for (let i = 0; i < m; i++) {
    let hii = 0.0;
    for (let a = 0; a < nf; a++) hii += Phi[i][a] * B[a][i];
    const denom = 1.0 - hii;
    const resid = targets[i] - yhat[i];
    // hii < 1 garantido para λ > 0; epsilon evita divisão numérica por zero
    const loo = denom > 1e-8 ? resid / denom : resid / 1e-8;
    err += loo * loo;
  }
  return err / m;
}

// Seleciona λ ótimo por LOO-CV em grid de candidatos.
// Usa features LEFT (já escaladas) para otimização, aplica o mesmo λ a ambos os olhos.
export function findBestLambda(
  scaledFeatures: number[][],
  targets: { screenX: number; screenY: number }[]
): number {
  const m = scaledFeatures.length;
  if (m < 20) return 1.0;

  const nf = scaledFeatures[0].length + 1; // +1 bias
  const Phi = scaledFeatures.map(f => [1.0, ...f]);

  // ΦᵀΦ pré-computado (compartilhado entre todos os λ)
  const PhiTPhi: number[][] = Array.from({ length: nf }, (_, i) =>
    Array.from({ length: nf }, (_, j) => {
      let s = 0.0;
      for (let k = 0; k < m; k++) s += Phi[k][i] * Phi[k][j];
      return s;
    })
  );

  const bX = Array.from({ length: nf }, (_, i) => {
    let s = 0.0;
    for (let k = 0; k < m; k++) s += Phi[k][i] * targets[k].screenX;
    return s;
  });
  const bY = Array.from({ length: nf }, (_, i) => {
    let s = 0.0;
    for (let k = 0; k < m; k++) s += Phi[k][i] * targets[k].screenY;
    return s;
  });

  const yX = targets.map(t => t.screenX);
  const yY = targets.map(t => t.screenY);

  const candidates = [0.01, 0.1, 0.5, 1.0, 5.0, 10.0, 50.0, 100.0];
  let bestLambda = 1.0;
  let bestErr = Infinity;

  for (const lambda of candidates) {
    const total =
      looMSE(Phi, PhiTPhi, bX, yX, lambda) +
      looMSE(Phi, PhiTPhi, bY, yY, lambda);
    if (total < bestErr) {
      bestErr = total;
      bestLambda = lambda;
    }
  }

  console.info(`[IrisFlow S3] λ LOO-CV: ${bestLambda}  (erro combinado: ${bestErr.toFixed(6)})`);
  return bestLambda;
}

export function trainRidgeModel(
  features: number[][],
  targets: { screenX: number; screenY: number }[],
  lambda = 1.0
): RidgeModel {
  const m = features.length;
  if (m === 0) return { betaX: [], betaY: [], numFeatures: 0 };

  const rawFeatures = features[0].length;
  const nf = rawFeatures + 1;

  const Phi = features.map(f => [1.0, ...f]);

  const A: number[][] = Array.from({ length: nf }, (_, i) =>
    Array.from({ length: nf }, (_, j) => {
      let s = 0;
      for (let k = 0; k < m; k++) s += Phi[k][i] * Phi[k][j];
      return s + (i === j && i > 0 ? lambda : 0);
    })
  );

  const bX = Array.from({ length: nf }, (_, i) => {
    let s = 0;
    for (let k = 0; k < m; k++) s += Phi[k][i] * targets[k].screenX;
    return s;
  });

  const bY = Array.from({ length: nf }, (_, i) => {
    let s = 0;
    for (let k = 0; k < m; k++) s += Phi[k][i] * targets[k].screenY;
    return s;
  });

  return {
    betaX: solveLinear(A, bX),
    betaY: solveLinear(A, bY),
    numFeatures: rawFeatures,
  };
}

// Retorna coordenadas normalizadas [0,1] — SEM clamp, SEM conversão para pixels.
// O clamp de viewport e a flag de baixa confiança ficam em calibration.mapGaze (G7).
export function predictRidge(
  model: RidgeModel,
  features: number[]
): { normX: number; normY: number } {
  if (features.length !== model.numFeatures) return { normX: 0.5, normY: 0.5 };
  const f = [1.0, ...features];
  let normX = 0.0;
  let normY = 0.0;
  for (let i = 0; i < f.length; i++) {
    normX += model.betaX[i] * f[i];
    normY += model.betaY[i] * f[i];
  }
  return { normX, normY };
}
