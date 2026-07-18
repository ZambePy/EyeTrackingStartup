interface KalmanAxis { x: number; v: number; P: number; }

export class KalmanEMASmoother {
  private axisX: KalmanAxis = { x: 0, v: 0, P: 1 };
  private axisY: KalmanAxis = { x: 0, v: 0, P: 1 };
  private emaX: number | null = null;
  private emaY: number | null = null;
  private emaAlpha: number;

  private static readonly Q_X = 0.0015;
  private static readonly R_X = 0.008;
  private static readonly Q_Y = 0.0008;
  private static readonly R_Y = 0.012;

  constructor(emaAlpha = 0.25) { this.emaAlpha = emaAlpha; }

  setEmaAlpha(alpha: number): void { this.emaAlpha = alpha; }

  private stepKalman(s: KalmanAxis, meas: number, Q: number, R: number): KalmanAxis {
    const xp = s.x + s.v;
    const Pp = s.P + Q;
    const K  = Pp / (Pp + R);
    const res = meas - xp;
    return { x: xp + K * res, v: s.v * 0.8 + K * res * 0.2, P: (1 - K) * Pp };
  }

  update(measX: number, measY: number): { x: number; y: number } {
    this.axisX = this.stepKalman(this.axisX, measX, KalmanEMASmoother.Q_X, KalmanEMASmoother.R_X);
    this.axisY = this.stepKalman(this.axisY, measY, KalmanEMASmoother.Q_Y, KalmanEMASmoother.R_Y);
    const kx = this.axisX.x, ky = this.axisY.x;
    if (this.emaX === null || this.emaY === null) { this.emaX = kx; this.emaY = ky; }
    else {
      this.emaX = this.emaAlpha * kx + (1 - this.emaAlpha) * this.emaX;
      this.emaY = this.emaAlpha * ky + (1 - this.emaAlpha) * this.emaY;
    }
    return { x: this.emaX, y: this.emaY };
  }

  reset(x: number, y: number): void {
    this.axisX = { x, v: 0, P: 1 };
    this.axisY = { x: y, v: 0, P: 1 };
    this.emaX = x;
    this.emaY = y;
  }
}
