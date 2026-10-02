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
  | 'swipeMaxSpeed'
  | 'swipeMaxGapMs'
  | 'swipeMaxDropoutMs'
  | 'swipeMinMovingFrames'
  | 'swipeSettleSpeed'
>;

interface Sample {
  t: number;
  x: number;
  y: number;
  palm: number;
  /** The hand was open the last time it was still (see `armed`). */
  armed: boolean;
  /**
   * This sample ends a big one-step jump (tracking lag or a dropout) that
   * stands for several frames of real motion.
   */
  leap: boolean;
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
 * space). A swipe fires when, inside the window, the hand travelled far enough,
 * mostly horizontally, and fast enough over several frames.
 *
 * Built around what real MediaPipe output looks like during a fast, blurred
 * swipe (measured on captured engine output, see docs/DECISIONS.md):
 *
 * - **Landmarks lag, then leap.** The tracker often keeps reporting the old
 *   position for 100–250 ms, or loses the hand for a few frames, and then
 *   reports it at the far side in one step, often with no visible motion
 *   before it. A single big horizontal step (or a short dropout ending in
 *   one) therefore counts as strong swipe evidence, unless it is mostly
 *   vertical or the hand's size changed drastically across it.
 * - **Blur distorts landmarks**: palm size shrinks and fingers look curled.
 *   Palm size (the distance unit) and the open-hand check are therefore taken
 *   from frames where the hand is still, and held while it moves.
 *
 * Return-stroke suppression: after a swipe the hand swings back. For
 * `swipeOppositeSuppressMs` the opposite direction is ignored, and a rejected
 * candidate *consumes* its motion so it can't fire once the timer expires, and
 * a swing-back that started inside the window stays suppressed until the hand
 * settles. A swipe-like motion that failed to fire still suppresses its own
 * swing-back, so a missed swipe never turns into a swipe the other way.
 */
export class SwipeDetector {
  private buf: Sample[] = [];
  private handSince: number | null = null;
  private lastSwipeT = -Infinity;
  private lastDir: SwipeDirection | null = null;
  /** Most recent swipe-like motion, fired or not (for return-stroke suppression). */
  private stroke: { dir: SwipeDirection; t: number } | null = null;
  /** After firing, the hand must slow down before the same direction can fire again. */
  private needsSettle = false;
  /**
   * A swing-back that began inside the suppression window stays suppressed
   * until the hand settles, even if it is still moving when the window ends.
   */
  private returning: SwipeDirection | null = null;
  private prev: { t: number; x: number; y: number } | null = null;
  /** Palm size measured while the hand is still (blur shrinks it mid-motion). */
  private refPalm: number | null = null;
  /** Open / not-open as of the last still frame. */
  private armed = false;
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
    if (palm <= 0) return null;
    if (this.handSince === null) this.handSince = t;
    this.refPalm ??= palm;
    const still = this.observe(t, center, palm, open);

    if (!eligible || t - this.handSince < this.cfg.swipeWarmupMs) {
      this.clear();
      return null;
    }
    // A hand held still and not open isn't in swipe posture.
    if (still && !open) {
      this.closedRun++;
      if (this.closedRun >= this.cfg.swipeClosedFramesReset) {
        this.clear();
        return null;
      }
    } else if (open) {
      this.closedRun = 0;
    }

    const ref = this.refPalm;
    let leap = false;
    const last = this.buf[this.buf.length - 1];
    if (last && t > last.t) {
      const dt = t - last.t;
      const ddx = (center.x - last.x) / ref;
      const ddy = (center.y - last.y) / ref;
      const stepSpeed = (Math.hypot(ddx, ddy) * 1000) / dt;
      const gap = dt > this.cfg.swipeMaxGapMs;
      if (stepSpeed > this.cfg.swipeMaxSpeed || dt > this.cfg.swipeMaxDropoutMs) {
        this.clear(); // faster than any hand, or lost too long: a discontinuity
      } else if (gap || Math.abs(ddx) >= this.cfg.swipeMinDx) {
        // A dropout or a one-step leap: part of a swipe, or a switch to another hand?
        const horizontal = Math.abs(ddx) >= this.cfg.swipeDxDyRatio * Math.abs(ddy);
        if (horizontal && this.sameHand(palm)) leap = true;
        else this.clear();
      }
    }

    this.buf.push({ t, x: center.x, y: center.y, palm, armed: this.armed, leap });
    const cutoff = t - this.cfg.swipeWindowMs;
    while (this.buf.length > 0 && (this.buf[0] as Sample).t < cutoff) this.buf.shift();
    if (this.buf.length < 2) return null;

    const first = this.buf[0] as Sample;
    const end = this.buf[this.buf.length - 1] as Sample;
    const dx = (end.x - first.x) / ref;
    const dy = (end.y - first.y) / ref;
    const sign = Math.sign(dx);

    // Peak speed and how many frame pairs moved at swipe speed. A leap stands
    // for several frames of fast motion the tracker did not report, so it
    // counts as two moving pairs.
    let peak = 0;
    let movingPairs = 0;
    for (let i = 1; i < this.buf.length; i++) {
      const a = this.buf[i - 1] as Sample;
      const b = this.buf[i] as Sample;
      const dt = b.t - a.t;
      if (dt <= 0) continue;
      const v = ((((b.x - a.x) / ref) * 1000) / dt) * sign;
      peak = Math.max(peak, v);
      if (v >= this.cfg.swipeMinSpeed) movingPairs += b.leap ? 2 : 1;
    }
    const armedShare = this.buf.filter((s) => s.armed).length / this.buf.length;

    this.debug.dx = dx;
    this.debug.dy = dy;
    this.debug.peakSpeed = peak;

    const shaped =
      Math.abs(dx) >= this.cfg.swipeMinDx &&
      Math.abs(dx) >= this.cfg.swipeDxDyRatio * Math.abs(dy) &&
      armedShare >= this.cfg.swipeOpenFraction;
    if (!shaped) return null;
    const dir: SwipeDirection = dx < 0 ? 'left' : 'right';

    if (peak < this.cfg.swipeMinSpeed || movingPairs < this.cfg.swipeMinMovingFrames) {
      // Swipe-shaped but not (yet) fast enough. Remember it as a stroke so a
      // swing back can't fire the other way, unless it *is* a swing back.
      if (this.suppressed(dir, t)) this.returning = dir;
      else this.stroke = { dir, t };
      return null;
    }

    this.clear(); // consume this motion whether or not it fires
    if (t - this.lastSwipeT < this.cfg.swipeCooldownMs) return null;
    if (this.suppressed(dir, t)) {
      this.returning = dir;
      return null;
    }
    if (this.needsSettle && dir === this.lastDir) return null;

    this.lastSwipeT = t;
    this.lastDir = dir;
    this.stroke = { dir, t };
    this.needsSettle = true;
    return dir;
  }

  /**
   * Track instantaneous speed, and refresh the palm-size reference and the
   * open-hand state on still frames. Returns whether this frame is still.
   */
  private observe(t: number, center: Vec2, palm: number, open: boolean): boolean {
    const ref = this.refPalm ?? palm;
    let still = true;
    if (this.prev && t > this.prev.t) {
      const dt = t - this.prev.t;
      const v = (((center.x - this.prev.x) / ref) * 1000) / dt;
      const vy = (((center.y - this.prev.y) / ref) * 1000) / dt;
      this.debug.speed = v;
      const speed = Math.hypot(v, vy);
      still = dt <= this.cfg.swipeMaxGapMs && speed < this.cfg.swipeMinSpeed;
      if (dt <= this.cfg.swipeMaxGapMs && speed < this.cfg.swipeSettleSpeed) {
        this.needsSettle = false;
        if (this.returning) {
          this.returning = null;
          this.clear(); // the buffered motion is the swing-back itself
        }
      }
    }
    if (still) {
      this.refPalm = ref * 0.7 + palm * 0.3;
      this.armed = open;
    }
    this.prev = { t, x: center.x, y: center.y };
    return still;
  }

  /**
   * Could it be the same hand on both sides of a jump? Only a drastic size
   * change (e.g. someone else much closer to the camera) rules it out.
   * Measured on real engine output: blur distorts palm size by up to ±60 %
   * mid-swipe, and MediaPipe confidently flips handedness during fast motion,
   * so neither a tight size bound nor a handedness check is usable.
   */
  private sameHand(palm: number): boolean {
    const ratio = palm / (this.refPalm ?? palm);
    return ratio >= 0.4 && ratio <= 2.5;
  }

  private suppressed(dir: SwipeDirection, t: number): boolean {
    if (this.returning === dir) return true;
    const recentFire =
      this.lastDir !== null &&
      dir !== this.lastDir &&
      t - this.lastSwipeT < this.cfg.swipeOppositeSuppressMs;
    const recentStroke =
      this.stroke !== null &&
      dir !== this.stroke.dir &&
      t - this.stroke.t < this.cfg.swipeOppositeSuppressMs;
    return recentFire || recentStroke;
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
    this.refPalm = null;
    this.armed = false;
    this.closedRun = 0;
    this.needsSettle = false;
    this.returning = null;
    this.debug.speed = 0;
  }
}
