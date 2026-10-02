import type { GestureConfig } from '../config';
import { dist, type Vec2 } from './geometry';

export type HoldConfig = Pick<
  GestureConfig,
  'holdDurationMs' | 'holdConfirmMs' | 'holdPresenceRatio' | 'holdMaxMovement' | 'holdReleaseMs'
>;

type Phase = 'idle' | 'holding' | 'fired';

/**
 * Generic hold-to-trigger detector.
 *
 * Progress advances with time while
 *   (a) the target pose is present for ≥ `holdPresenceRatio` of the hold —
 *       dropouts are tolerated until their cumulative time exceeds
 *       (1 − ratio) × duration, and
 *   (b) the palm centre stays within `holdMaxMovement` palm sizes of where
 *       the hold began. This stationarity rule is what separates "holding an
 *       open palm" from "swiping with an open hand".
 * Progress reaches 100 % after `holdDurationMs`; the hold then fires once the
 * pose has stayed still for a further `holdConfirmMs`. That confirmation
 * window exists because MediaPipe often *freezes* the landmarks for
 * 100–250 ms when a fast swipe starts: without it, a hand resting before a
 * swipe would look still long enough to fire, and the swipe would be lost.
 * After firing, the pose must be released for `holdReleaseMs` before it can
 * fire again.
 */
export class HoldDetector<P extends string = string> {
  /** 0‥1, for the progress ring. */
  progress = 0;
  private phase: Phase = 'idle';
  private start = 0;
  private anchor: Vec2 = { x: 0, y: 0 };
  private anchorPalm = 1;
  private absentMs = 0;
  private releasedMs = 0;
  private lastT: number | null = null;

  constructor(
    readonly pose: P,
    private cfg: HoldConfig,
  ) {}

  setConfig(cfg: HoldConfig): void {
    this.cfg = cfg;
  }

  /**
   * @param present whether the target pose is detected this frame
   * @param center palm centre (display space); null when no hand is visible
   * @returns true on the frame the hold fires
   */
  update(t: number, present: boolean, center: Vec2 | null, palm: number): boolean {
    const dt = this.lastT === null ? 0 : Math.max(0, t - this.lastT);
    this.lastT = t;
    const visible = present && center !== null && palm > 0;

    switch (this.phase) {
      case 'fired':
        this.progress = 0;
        this.releasedMs = visible ? 0 : this.releasedMs + dt;
        if (this.releasedMs >= this.cfg.holdReleaseMs) this.phase = 'idle';
        return false;

      case 'idle':
        if (visible) this.begin(t, center, palm);
        return false;

      case 'holding': {
        if (!visible) {
          this.absentMs += dt;
        } else if (dist(center, this.anchor) / this.anchorPalm >= this.cfg.holdMaxMovement) {
          this.begin(t, center, palm); // moved too much: start over from here
          return false;
        }
        const allowedAbsence = (1 - this.cfg.holdPresenceRatio) * this.cfg.holdDurationMs;
        if (this.absentMs > allowedAbsence) {
          this.phase = 'idle';
          this.progress = 0;
          return false;
        }
        const elapsed = t - this.start;
        this.progress = Math.min(1, elapsed / this.cfg.holdDurationMs);
        if (elapsed >= this.cfg.holdDurationMs + this.cfg.holdConfirmMs) {
          this.phase = 'fired';
          this.releasedMs = 0;
          this.progress = 0;
          return true;
        }
        return false;
      }
    }
  }

  private begin(t: number, center: Vec2, palm: number): void {
    this.phase = 'holding';
    this.start = t;
    this.anchor = { ...center };
    this.anchorPalm = palm;
    this.absentMs = 0;
    this.progress = 0;
  }

  /**
   * Behave as if the hold just fired: the pose must be released before a new
   * hold can start. Used after a swipe so an open hand that comes to rest
   * doesn't turn into a palm hold.
   */
  latch(): void {
    this.phase = 'fired';
    this.progress = 0;
    this.releasedMs = 0;
    this.absentMs = 0;
  }

  /** True after firing until the pose has been released long enough. */
  get awaitingRelease(): boolean {
    return this.phase === 'fired';
  }

  reset(): void {
    this.phase = 'idle';
    this.progress = 0;
    this.absentMs = 0;
    this.releasedMs = 0;
    this.lastT = null;
  }
}
