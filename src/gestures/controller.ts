import { resolveConfig, type GestureConfig } from '../config';
import type { HandFrame } from '../engine/types';
import { LM } from '../engine/types';
import {
  indexReach,
  mapActiveRegion,
  palmCenter,
  palmSize,
  pinchRatio,
  toDisplayPoints,
  type Vec2,
} from './geometry';
import {
  GestureEmitter,
  type AnyListener,
  type ControllerState,
  type GestureEventMap,
  type GestureEventType,
  type HoldPose,
  type Listener,
} from './events';
import { HoldDetector } from './hold';
import { OneEuroFilter2D } from './oneEuro';
import { PinchDetector } from './pinch';
import { classifyFeatures, poseFeatures, resolvePose, type Pose } from './pose';
import { SwipeDetector } from './swipe';

/** Per-frame internals, for the Playground readouts. */
export interface ControllerDebug {
  t: number;
  handPresent: boolean;
  handedness: string | null;
  palmSize: number | null;
  pinchRatio: number | null;
  indexReach: number | null;
  fingers: number;
  thumbExtended: boolean;
  thumbRise: number;
  rulePose: Pose | null;
  canned: { name: string; score: number } | null;
  pose: Pose | null;
  poseSource: 'canned' | 'rules' | null;
  /** Instantaneous horizontal palm speed, palm sizes/s (+ = presenter's right). */
  swipeSpeed: number;
  holds: Record<HoldPose, number>;
  state: ControllerState;
}

const HOLD_POSES: readonly HoldPose[] = ['fist', 'open_palm', 'thumbs_up'];

/**
 * Turns a stream of `HandFrame`s into presentation actions. It depends only on
 * the engine-agnostic frame type — no camera, DOM, or MediaPipe — so it is
 * fully unit-testable with synthetic hands and works with any engine.
 *
 * Rules (§5.6):
 *  - LOCKED:   only fist-hold (to unlock) works.
 *  - BLACKOUT: only palm-hold (restore) and fist-hold (lock) work.
 *  - PINCHING: laser only; swipes and holds are suppressed.
 *  - Hand missing for > handLostMs → every detector resets.
 */
export class GestureController {
  private cfg: GestureConfig;
  private readonly emitter = new GestureEmitter();
  private readonly pinch: PinchDetector;
  private readonly swipe: SwipeDetector;
  private readonly holds: Record<HoldPose, HoldDetector<HoldPose>>;
  private readonly laserFilter: OneEuroFilter2D;

  private _locked = false;
  private _blackout = false;
  private _state: ControllerState = 'NO_HAND';
  private lastHandT: number | null = null;
  private handPresent = false;
  private lastHoldEmit: { pose: HoldPose | null; progress: number } = { pose: null, progress: 0 };

  readonly debug: ControllerDebug = {
    t: 0,
    handPresent: false,
    handedness: null,
    palmSize: null,
    pinchRatio: null,
    indexReach: null,
    fingers: 0,
    thumbExtended: false,
    thumbRise: 0,
    rulePose: null,
    canned: null,
    pose: null,
    poseSource: null,
    swipeSpeed: 0,
    holds: { fist: 0, open_palm: 0, thumbs_up: 0 },
    state: 'NO_HAND',
  };

  constructor(config: Partial<GestureConfig> = {}) {
    this.cfg = resolveConfig(config);
    this.pinch = new PinchDetector(this.cfg);
    this.swipe = new SwipeDetector(this.cfg);
    this.holds = {
      fist: new HoldDetector('fist', this.cfg),
      open_palm: new HoldDetector('open_palm', this.cfg),
      thumbs_up: new HoldDetector('thumbs_up', this.cfg),
    };
    this.laserFilter = new OneEuroFilter2D(
      this.cfg.laserMinCutoff,
      this.cfg.laserBeta,
      this.cfg.laserDCutoff,
    );
  }

  // ── public API ─────────────────────────────────────────────────────────────

  on<K extends GestureEventType>(type: K, fn: Listener<K>): () => void {
    return this.emitter.on(type, fn);
  }

  onAny(fn: AnyListener): () => void {
    return this.emitter.onAny(fn);
  }

  get config(): Readonly<GestureConfig> {
    return this.cfg;
  }

  get state(): ControllerState {
    return this._state;
  }

  get locked(): boolean {
    return this._locked;
  }

  get blackout(): boolean {
    return this._blackout;
  }

  get pinching(): boolean {
    return this.pinch.pinching;
  }

  setConfig(config: Partial<GestureConfig>): void {
    this.cfg = resolveConfig(config);
    this.pinch.setConfig(this.cfg);
    this.swipe.setConfig(this.cfg);
    for (const h of Object.values(this.holds)) h.setConfig(this.cfg);
    this.laserFilter.setParams(this.cfg.laserMinCutoff, this.cfg.laserBeta, this.cfg.laserDCutoff);
  }

  /** Same effect as a fist-hold (used by the `L` key). */
  toggleLock(): void {
    this.applyLock(!this._locked);
  }

  /** Same effect as a palm-hold (used by the `B` key). */
  toggleBlackout(): void {
    this.applyBlackout(!this._blackout);
  }

  /** Set lock / blackout without emitting toggle events (e.g. when a view mounts). */
  syncState(s: { locked?: boolean; blackout?: boolean }): void {
    if (s.locked !== undefined && s.locked !== this._locked) {
      this._locked = s.locked;
      if (s.locked) this.suppressForLock();
    }
    if (s.blackout !== undefined && s.blackout !== this._blackout) {
      this._blackout = s.blackout;
      if (s.blackout) this.endPinch();
    }
    this.refreshState();
  }

  /** Forget all detector state (not lock / blackout). */
  reset(): void {
    this.endPinch();
    this.swipe.reset();
    for (const h of Object.values(this.holds)) h.reset();
    this.laserFilter.reset();
    this.emitHoldProgress();
  }

  update(frame: HandFrame): void {
    const t = frame.t;
    this.debug.t = t;
    const hand = frame.hands[0];

    if (!hand || hand.landmarks.length < 21) {
      this.handleNoHand(t);
      return;
    }

    const points = toDisplayPoints(hand.landmarks, frame.videoWidth, frame.videoHeight);
    const size = palmSize(points);
    if (!(size > 1e-6)) {
      this.handleNoHand(t);
      return;
    }
    this.lastHandT = t;
    this.handPresent = true;

    const center = palmCenter(points);
    const feats = poseFeatures(points, this.cfg);
    const rulePose = classifyFeatures(feats, this.cfg);
    const { pose, source } = resolvePose(rulePose, hand.cannedGesture, this.cfg.cannedMinScore);
    const ratio = pinchRatio(points);
    const reach = indexReach(points);

    Object.assign(this.debug, {
      handPresent: true,
      handedness: hand.handedness,
      palmSize: size,
      pinchRatio: ratio,
      indexReach: reach,
      fingers: feats.fingers,
      thumbExtended: feats.thumbExtended,
      thumbRise: feats.thumbRise,
      rulePose,
      canned: hand.cannedGesture ?? null,
      pose,
      poseSource: source,
    });

    // 1 ── Pinch → laser. The index-reach guard only gates *entering* a pinch.
    const pinchAllowed = !this._locked && !this._blackout;
    if (!pinchAllowed) {
      this.endPinch();
    } else {
      const input = this.pinch.pinching || reach >= this.cfg.pinchMinIndexReach ? ratio : null;
      const transition = this.pinch.update(input);
      if (transition === 'start') {
        this.laserFilter.reset();
        this.swipe.clear();
        this.resetHolds();
      } else if (transition === 'end') {
        this.laserFilter.reset();
        this.emitter.emit('laserEnd', {});
      }
      if (this.pinch.pinching) this.emitLaser(frame, hand.landmarks, t);
    }

    // 2 ── Swipe → next / previous.
    const swipeEligible = !this._locked && !this._blackout && !this.pinch.pinching;
    const open = feats.fingers >= this.cfg.openHandMinFingers;
    const dir = this.swipe.update(t, center, size, open, swipeEligible);
    this.debug.swipeSpeed = this.swipe.debug.speed;
    if (dir) {
      const isNext = (dir === 'left') !== this.cfg.invertSwipe;
      this.emitter.emit(isNext ? 'next' : 'prev', {});
      // A presenter often leaves the open hand raised after swiping. Latch the
      // palm hold so blackout needs the hand lowered/closed (≥ holdReleaseMs)
      // and raised again, instead of firing after one second of rest.
      this.resetHolds();
      this.holds.open_palm.latch();
    }

    // 3 ── Holds → lock / blackout / timer.
    this.updateHolds(t, pose, center, size);
    this.refreshState();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private handleNoHand(t: number): void {
    const lost = this.lastHandT === null || t - this.lastHandT > this.cfg.handLostMs;
    if (lost) {
      if (this.handPresent || this.pinch.pinching) this.reset();
      this.handPresent = false;
      Object.assign(this.debug, {
        handPresent: false,
        handedness: null,
        palmSize: null,
        pinchRatio: null,
        indexReach: null,
        rulePose: null,
        canned: null,
        pose: null,
        poseSource: null,
        swipeSpeed: 0,
      });
    } else {
      // Short dropout: holds count it as an absent frame; nothing else changes.
      this.updateHolds(t, null, null, 0);
    }
    this.refreshState();
  }

  private holdActive(pose: HoldPose): boolean {
    if (this.pinch.pinching) return false;
    switch (pose) {
      case 'fist':
        return true;
      case 'open_palm':
        return !this._locked;
      case 'thumbs_up':
        return !this._locked && !this._blackout;
    }
  }

  private updateHolds(t: number, pose: Pose | null, center: Vec2 | null, size: number): void {
    for (const p of HOLD_POSES) {
      const h = this.holds[p];
      if (!this.holdActive(p)) {
        h.reset();
        continue;
      }
      if (h.update(t, pose === p, center, size)) this.fireHold(p);
    }
    this.emitHoldProgress();
  }

  private fireHold(pose: HoldPose): void {
    switch (pose) {
      case 'fist':
        this.applyLock(!this._locked);
        break;
      case 'open_palm':
        this.applyBlackout(!this._blackout);
        break;
      case 'thumbs_up':
        this.emitter.emit('toggleTimer', {});
        break;
    }
  }

  private applyLock(locked: boolean): void {
    if (locked === this._locked) return;
    this._locked = locked;
    if (locked) this.suppressForLock();
    this.emitter.emit('toggleLock', { locked });
    this.refreshState();
  }

  private applyBlackout(active: boolean): void {
    if (active === this._blackout) return;
    this._blackout = active;
    if (active) {
      this.endPinch();
      this.swipe.clear();
    }
    this.emitter.emit('toggleBlackout', { active });
    this.refreshState();
  }

  private suppressForLock(): void {
    this.endPinch();
    this.swipe.clear();
    this.holds.open_palm.reset();
    this.holds.thumbs_up.reset();
  }

  private resetHolds(): void {
    for (const h of Object.values(this.holds)) h.reset();
  }

  private endPinch(): void {
    if (this.pinch.pinching) {
      this.pinch.reset();
      this.laserFilter.reset();
      this.emitter.emit('laserEnd', {});
    } else {
      this.pinch.reset();
    }
  }

  private emitLaser(
    frame: HandFrame,
    lms: HandFrame['hands'][number]['landmarks'],
    t: number,
  ): void {
    const a = lms[LM.THUMB_TIP];
    const b = lms[LM.INDEX_TIP];
    if (!a || !b) return;
    // Midpoint in mirrored display space, filtered in camera pixels so the
    // One Euro beta has a sensible scale (see docs/DECISIONS.md).
    const w = frame.videoWidth || 1;
    const h = frame.videoHeight || 1;
    const xd = 1 - (a.x + b.x) / 2;
    const yd = (a.y + b.y) / 2;
    const f = this.laserFilter.filter(xd * w, yd * h, t);
    const p = mapActiveRegion({ x: f.x / w, y: f.y / h }, this.cfg.activeRegion);
    this.emitter.emit('laserMove', p);
  }

  private emitHoldProgress(): void {
    let pose: HoldPose | null = null;
    let progress = 0;
    for (const p of HOLD_POSES) {
      const v = this.holds[p].progress;
      this.debug.holds[p] = v;
      if (v > progress) {
        progress = v;
        pose = p;
      }
    }
    const last = this.lastHoldEmit;
    const changed =
      pose !== last.pose ||
      Math.abs(progress - last.progress) >= 0.02 ||
      (progress === 0 && last.progress !== 0);
    if (changed) {
      this.lastHoldEmit = { pose, progress };
      this.emitter.emit('holdProgress', { pose, progress });
    }
  }

  private refreshState(): void {
    const next: ControllerState = this._locked
      ? 'LOCKED'
      : this._blackout
        ? 'BLACKOUT'
        : !this.handPresent
          ? 'NO_HAND'
          : this.pinch.pinching
            ? 'PINCHING'
            : 'ACTIVE';
    this.debug.state = next;
    if (next !== this._state) {
      const previous = this._state;
      this._state = next;
      this.emitter.emit('stateChange', { state: next, previous });
    }
  }
}

export type { GestureEventMap };
