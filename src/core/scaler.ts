export class StandardScaler {
  private means: number[] = [];
  private stds: number[]  = [];
  private isFitted = false;

  fit(data: number[][]): void {
    if (data.length === 0) return;
    const n = data.length;
    const nf = data[0].length;
    this.means = new Array(nf).fill(0);
    this.stds  = new Array(nf).fill(0);
    for (let i = 0; i < n;  i++) for (let j = 0; j < nf; j++) this.means[j] += data[i][j];
    for (let j = 0; j < nf; j++) this.means[j] /= n;
    for (let i = 0; i < n;  i++) for (let j = 0; j < nf; j++) { const d = data[i][j] - this.means[j]; this.stds[j] += d * d; }
    for (let j = 0; j < nf; j++) { this.stds[j] = Math.sqrt(this.stds[j] / n); if (this.stds[j] < 1e-8) this.stds[j] = 1.0; }
    this.isFitted = true;
  }

  transform(data: number[][]): number[][] {
    if (!this.isFitted) return data;
    return data.map(row => row.map((v, j) => (v - this.means[j]) / this.stds[j]));
  }

  transformSingle(row: number[]): number[] {
    if (!this.isFitted) return row;
    return row.map((v, j) => (v - this.means[j]) / this.stds[j]);
  }

  getParams(): { means: number[]; stds: number[] } {
    return { means: this.means, stds: this.stds };
  }

  setParams(means: number[], stds: number[]): void {
    this.means = means;
    this.stds  = stds;
    this.isFitted = true;
  }
}
