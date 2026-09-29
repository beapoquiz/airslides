export interface PinchConfig {
  pinchEnter: number;
  pinchExit: number;
  pinchFrames: number;
}

export type PinchTransition = 'start' | 'end' | null;

/**
 * Pinch with hysteresis + debounce. Enter when the ratio stays below
 * `pinchEnter` for `pinchFrames` consecutive frames; exit when it stays above
 * `pinchExit` for `pinchFrames` frames. Values between the two thresholds keep
 * the current state, so a ratio hovering near one threshold cannot flicker.
 */
export class PinchDetector {
  pinching = false;
  private enterRun = 0;
  private exitRun = 0;

  constructor(private cfg: PinchConfig) {}

  setConfig(cfg: PinchConfig): void {
    this.cfg = cfg;
  }

  /**
   * @param ratio thumb-tip ↔ index-tip distance in palm sizes, or `null` when
   *   the pinch is not allowed this frame (counts as "open").
   */
  update(ratio: number | null): PinchTransition {
    const r = ratio ?? Infinity;
    if (!this.pinching) {
      this.enterRun = r < this.cfg.pinchEnter ? this.enterRun + 1 : 0;
      if (this.enterRun >= this.cfg.pinchFrames) {
        this.pinching = true;
        this.enterRun = 0;
        this.exitRun = 0;
        return 'start';
      }
    } else {
      this.exitRun = r > this.cfg.pinchExit ? this.exitRun + 1 : 0;
      if (this.exitRun >= this.cfg.pinchFrames) {
        this.pinching = false;
        this.enterRun = 0;
        this.exitRun = 0;
        return 'end';
      }
    }
    return null;
  }

  reset(): void {
    this.pinching = false;
    this.enterRun = 0;
    this.exitRun = 0;
  }
}
