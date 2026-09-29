/**
 * Every tunable number in the gesture pipeline lives here.
 *
 * Distances and speeds are in **palm-size units** (palm size = distance from
 * the wrist to the middle-finger MCP joint, measured in aspect-corrected
 * image coordinates), so the same thresholds work whether the presenter is
 * 0.5 m or 1.5 m from the camera. Times are in milliseconds.
 */
export interface GestureConfig {
  // ── Finger / thumb state (§5.1) ────────────────────────────────────────────
  /** A finger is extended when dist(wrist, tip) > dist(wrist, PIP) × this. */
  fingerExtendedRatio: number;
  /** Thumb extended when dist(thumbTip, pinkyMCP) > dist(thumbIP, pinkyMCP) × this… */
  thumbExtendedRatio: number;
  /** …and dist(thumbTip, indexMCP) is at least this many palm sizes. */
  thumbMinSpread: number;
  /** "Open hand" for swiping = at least this many of index/middle/ring/pinky extended. */
  openHandMinFingers: number;

  // ── Pose classification (§5.4) ────────────────────────────────────────────
  /** Thumbs-up: thumb tip must be above the thumb MCP by more than this (palm sizes). */
  thumbsUpMinRise: number;
  /** Use MediaPipe's canned gesture instead of the rules when its score ≥ this. */
  cannedMinScore: number;

  // ── Pinch → laser (§5.2) ──────────────────────────────────────────────────
  /** Enter pinch when dist(thumbTip, indexTip) / palmSize drops below this… */
  pinchEnter: number;
  /** …and leave it when the ratio rises above this (hysteresis gap avoids flicker). */
  pinchExit: number;
  /** Consecutive frames required to enter or exit (debounce). */
  pinchFrames: number;
  /**
   * Guard against fists: the index tip must reach at least this far from the
   * wrist, relative to the index MCP. In a fist the curled index tip sits by
   * the palm (ratio ≈ 0.8–1.0) and can touch the thumb, which would otherwise
   * read as a pinch. See docs/DECISIONS.md.
   */
  pinchMinIndexReach: number;
  /** One Euro filter for the laser (applied in camera-pixel units). */
  laserMinCutoff: number;
  laserBeta: number;
  laserDCutoff: number;
  /**
   * Fraction of the camera frame (centred) that maps to the full slide, so the
   * presenter never has to reach the frame edges. 0.7 = central 70 %.
   */
  activeRegion: number;

  // ── Swipe → next / previous (§5.3) ────────────────────────────────────────
  /** History window used to measure a swipe. */
  swipeWindowMs: number;
  /** Minimum horizontal travel inside the window (palm sizes). */
  swipeMinDx: number;
  /** Horizontal travel must be at least this multiple of vertical travel. */
  swipeDxDyRatio: number;
  /** Peak horizontal speed must reach this (palm sizes per second). */
  swipeMinSpeed: number;
  /** After any swipe, ignore all swipes for this long. */
  swipeCooldownMs: number;
  /** After a swipe, ignore the opposite direction this long (return stroke). */
  swipeOppositeSuppressMs: number;
  /** Ignore swipes this long after a hand appears (entering the frame). */
  swipeWarmupMs: number;
  /** Share of samples in the window that must be an open hand (tolerates motion blur). */
  swipeOpenFraction: number;
  /**
   * This many consecutive not-open frames wipe the swipe history, so motion
   * made with a closed or relaxed hand never counts toward a swipe that
   * finishes after the hand opens. 1–2 blurred frames are still tolerated.
   */
  swipeClosedFramesReset: number;
  /** Presenter's-view mapping: false → moving toward your left = next. */
  invertSwipe: boolean;

  // ── Hold → blackout / timer / lock (§5.5) ─────────────────────────────────
  /** How long a pose must be held still to fire. */
  holdDurationMs: number;
  /** The pose must be present for at least this share of the hold. */
  holdPresenceRatio: number;
  /** Palm centre must stay within this many palm sizes of where the hold began. */
  holdMaxMovement: number;
  /** After firing, the pose must be released this long before it can fire again. */
  holdReleaseMs: number;

  // ── Controller (§5.6) ────────────────────────────────────────────────────
  /** Hand missing for longer than this → reset every detector. */
  handLostMs: number;
}

export const DEFAULT_CONFIG: Readonly<GestureConfig> = Object.freeze({
  fingerExtendedRatio: 1.15,
  thumbExtendedRatio: 1.1,
  thumbMinSpread: 0.6,
  openHandMinFingers: 3,

  thumbsUpMinRise: 0.5,
  cannedMinScore: 0.6,

  pinchEnter: 0.35,
  pinchExit: 0.5,
  pinchFrames: 2,
  pinchMinIndexReach: 1.1,
  laserMinCutoff: 1.0,
  laserBeta: 0.02,
  laserDCutoff: 1.0,
  activeRegion: 0.7,

  swipeWindowMs: 350,
  swipeMinDx: 1.5,
  swipeDxDyRatio: 2,
  swipeMinSpeed: 3,
  swipeCooldownMs: 700,
  swipeOppositeSuppressMs: 1000,
  swipeWarmupMs: 200,
  swipeOpenFraction: 0.7,
  swipeClosedFramesReset: 3,
  invertSwipe: false,

  holdDurationMs: 1000,
  holdPresenceRatio: 0.8,
  holdMaxMovement: 0.5,
  holdReleaseMs: 300,

  handLostMs: 300,
});

export type NumericConfigKey = {
  [K in keyof GestureConfig]: GestureConfig[K] extends number ? K : never;
}[keyof GestureConfig];

export interface SliderSpec {
  key: NumericConfigKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

/** Thresholds exposed as sliders in the Playground. */
export const SLIDERS: readonly SliderSpec[] = [
  { key: 'pinchEnter', label: 'Pinch enter', min: 0.1, max: 0.8, step: 0.01, unit: '× palm' },
  { key: 'pinchExit', label: 'Pinch exit', min: 0.15, max: 1.0, step: 0.01, unit: '× palm' },
  { key: 'swipeMinDx', label: 'Swipe distance', min: 0.5, max: 4, step: 0.1, unit: '× palm' },
  { key: 'swipeMinSpeed', label: 'Swipe speed', min: 1, max: 10, step: 0.1, unit: 'palm/s' },
  { key: 'swipeWindowMs', label: 'Swipe window', min: 150, max: 800, step: 10, unit: 'ms' },
  { key: 'swipeCooldownMs', label: 'Swipe cooldown', min: 200, max: 2000, step: 50, unit: 'ms' },
  {
    key: 'swipeOppositeSuppressMs',
    label: 'Return-stroke block',
    min: 300,
    max: 2500,
    step: 50,
    unit: 'ms',
  },
  { key: 'holdDurationMs', label: 'Hold duration', min: 400, max: 3000, step: 50, unit: 'ms' },
  {
    key: 'holdMaxMovement',
    label: 'Hold stillness',
    min: 0.1,
    max: 1.5,
    step: 0.05,
    unit: '× palm',
  },
  {
    key: 'fingerExtendedRatio',
    label: 'Finger extended',
    min: 1.0,
    max: 1.5,
    step: 0.01,
    unit: '×',
  },
  { key: 'cannedMinScore', label: 'Canned gesture min score', min: 0, max: 1, step: 0.05 },
  { key: 'laserMinCutoff', label: 'Laser min cutoff', min: 0.1, max: 5, step: 0.1, unit: 'Hz' },
  { key: 'laserBeta', label: 'Laser beta', min: 0, max: 0.2, step: 0.005 },
  { key: 'activeRegion', label: 'Active region', min: 0.3, max: 1, step: 0.05, unit: '× frame' },
];

/** Merge user overrides onto the defaults, ignoring unknown or non-finite values. */
export function resolveConfig(overrides: Partial<GestureConfig> = {}): GestureConfig {
  const cfg: GestureConfig = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof GestureConfig)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (
      typeof DEFAULT_CONFIG[key] === 'number' &&
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      (cfg as unknown as Record<string, unknown>)[key] = value;
    } else if (typeof DEFAULT_CONFIG[key] === 'boolean' && typeof value === 'boolean') {
      (cfg as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return cfg;
}
