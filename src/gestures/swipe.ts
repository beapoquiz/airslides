import type { GestureConfig } from '../config';
import type { Vec2 } from './geometry';

/** Direction in the presenter's (mirrored) view: 'left' = toward the presenter's left. */
export type SwipeDirection = 'left' | 'right';

export type SwipeConfig = Pick<
  GestureConfig,
  | 'swipeWindowMs'
  | 'swipeMinDx'
  | 'swipeDxDyRatio'
  | 'swipeMinSpeed'
  | 'swipeCooldownMs'
  | 'swipeOppositeSuppressMs'
  | 'swipeWarmupMs'
  | 'swipeOpenFraction'
  | 'swipeClosedFramesReset'
>;

interface Sample {
  t: number;
  x: number;
  y: number;
  palm: number;
  open: boolean;
}

export interface SwipeDebug {
  /** Instantaneous horizontal speed, palm sizes/s (display space, + = rightward). */
  speed: number;
  /** Horizontal / vertical travel across the current window, palm sizes. */
  dx: number;
  dy: number;
  /** Peak horizontal speed in the direction of travel, palm sizes/s. */
  peakSpeed: number;
}

/**
 * Swipe detector over a short history of palm-centre positions (display
 * space). A swipe fires when, inside the window, the hand travelled far enough
 * horizontally, mostly horizontally, and fast enough at its peak.
 *
 * Return-stroke suppression: after a swipe the hand naturally swings back.
 * For `swipeOppositeSuppressMs` the opposite direction is ignored, and any
 * rejected candidate *consumes* the motion (the buffer is cleared), so the
 * return stroke cannot fire later once the timer expires.
 */
export class SwipeDetector {
  private buf: Sample[] = [];
  private handSince: number | null = null;
  private lastSwipeT = -Infinity;
  private lastDir: SwipeDirection | null = null;
  private prev: { t: number; x: number; palm: number } | null = null;
  private closedRun = 0;
  readonly debug: SwipeDebug = { speed: 0, dx: 0, dy: 0, peakSpeed: 0 };

  constructor(private cfg: SwipeConfig) {}

  setConfig(cfg: SwipeConfig): void {
    this.cfg = cfg;
  }

  /**
   * @param center palm centre in display space
   * @param palm palm size (same units as `center`)
   * @param open whether the hand counts as open this frame
   * @param eligible false while locked / pinching / blacked out (clears history)
   */
  update(
    t: number,
    center: Vec2,
    palm: number,
    open: boolean,
    eligible: boolean,
  ): SwipeDirection | null {
    if (this.handSince === null) this.handSince = t;
    this.updateSpeed(t, center, palm);

    if (!eligible || palm <= 0 || t - this.handSince < this.cfg.swipeWarmupMs) {
      this.clear();
      return null;
    }
    this.closedRun = open ? 0 : this.closedRun + 1;
    if (this.closedRun >= this.cfg.swipeClosedFramesReset) {
      this.clear();
      return null;
    }

    this.buf.push({ t, x: center.x, y: center.y, palm, open });
    const cutoff = t - this.cfg.swipeWindowMs;
    while (this.buf.length > 0 && (this.buf[0] as Sample).t < cutoff) this.buf.shift();
    if (this.buf.length < 2) return null;

    const first = this.buf[0] as Sample;
    const last = this.buf[this.buf.length - 1] as Sample;
    const meanPalm = this.buf.reduce((s, p) => s + p.palm, 0) / this.buf.length;
    const dx = (last.x - first.x) / meanPalm;
    const dy = (last.y - first.y) / meanPalm;
    const sign = Math.sign(dx);

    let peak = 0;
    for (let i = 1; i < this.buf.length; i++) {
      const a = this.buf[i - 1] as Sample;
      const b = this.buf[i] as Sample;
      const dt = b.t - a.t;
      if (dt <= 0) continue;
      const v = (((b.x - a.x) / meanPalm) * 1000) / dt;
      peak = Math.max(peak, v * sign);
    }
    const openShare = this.buf.filter((s) => s.open).length / this.buf.length;

    this.debug.dx = dx;
    this.debug.dy = dy;
    this.debug.peakSpeed = peak;

    const isSwipe =
      Math.abs(dx) >= this.cfg.swipeMinDx &&
      Math.abs(dx) >= this.cfg.swipeDxDyRatio * Math.abs(dy) &&
      peak >= this.cfg.swipeMinSpeed &&
      openShare >= this.cfg.swipeOpenFraction;
    if (!isSwipe) return null;

    const dir: SwipeDirection = dx < 0 ? 'left' : 'right';
    this.clear(); // consume this motion whether or not it fires

    const since = t - this.lastSwipeT;
    if (since < this.cfg.swipeCooldownMs) return null;
    if (this.lastDir !== null && dir !== this.lastDir && since < this.cfg.swipeOppositeSuppressMs) {
      return null;
    }
    this.lastSwipeT = t;
    this.lastDir = dir;
    return dir;
  }

  private updateSpeed(t: number, center: Vec2, palm: number): void {
    if (this.prev && t > this.prev.t && palm > 0) {
      this.debug.speed = (((center.x - this.prev.x) / palm) * 1000) / (t - this.prev.t);
    }
    this.prev = { t, x: center.x, palm };
  }

  /** Drop the motion history (keeps cooldown / suppression timers). */
  clear(): void {
    this.buf = [];
    this.debug.dx = 0;
    this.debug.dy = 0;
    this.debug.peakSpeed = 0;
  }

  /**
   * Hand lost: forget history and restart the warm-up. Cooldown and
   * return-stroke timers are kept on purpose — a fast swipe often carries the
   * hand out of frame, and it must not fire the other way as it comes back.
   */
  reset(): void {
    this.clear();
    this.handSince = null;
    this.prev = null;
    this.closedRun = 0;
    this.debug.speed = 0;
  }
}
