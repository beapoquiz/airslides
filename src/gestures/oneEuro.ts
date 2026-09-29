/**
 * One Euro filter (Casiez, Roussel & Vogel, CHI 2012): a low-pass filter whose
 * cutoff rises with speed, so it removes jitter when the hand is still but
 * adds little lag when it moves fast.
 *
 *   cutoff = minCutoff + beta × |filtered derivative|
 */
function smoothingFactor(cutoffHz: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private lastT: number | null = null;

  constructor(
    public minCutoff = 1.0,
    public beta = 0.02,
    public dCutoff = 1.0,
  ) {}

  /** @param value raw sample  @param tMs timestamp in milliseconds */
  filter(value: number, tMs: number): number {
    if (this.x === null || this.lastT === null) {
      this.x = value;
      this.dx = 0;
      this.lastT = tMs;
      return value;
    }
    const dt = (tMs - this.lastT) / 1000;
    if (dt <= 0) return this.x; // duplicate / out-of-order timestamp
    this.lastT = tMs;

    const rawDx = (value - this.x) / dt;
    this.dx += smoothingFactor(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += smoothingFactor(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset(): void {
    this.x = null;
    this.dx = 0;
    this.lastT = null;
  }
}

export class OneEuroFilter2D {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  setParams(minCutoff: number, beta: number, dCutoff: number): void {
    for (const f of [this.fx, this.fy]) {
      f.minCutoff = minCutoff;
      f.beta = beta;
      f.dCutoff = dCutoff;
    }
  }

  filter(x: number, y: number, tMs: number): { x: number; y: number } {
    return { x: this.fx.filter(x, tMs), y: this.fy.filter(y, tMs) };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
