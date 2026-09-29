/**
 * Build timed HandFrame sequences from templates, e.g.
 *
 *   new Seq().hold(OPEN_HAND, C, 300).move(OPEN_HAND, C, LEFT, 250).frames
 *
 * Positions are palm centres in display coordinates ([0,1], mirrored like the
 * on-screen preview), so "move toward x = 0.2" is the presenter moving their
 * hand to their own left.
 */
import type { HandFrame, HandObservation } from '../../src/engine/types';
import { placeHand, rng, type HandTemplate } from './handTemplates';

export interface Pt {
  x: number;
  y: number;
}

export interface SegmentOptions {
  scale?: number;
  rotationDeg?: number;
  noise?: number;
  canned?: { name: string; score: number };
  /** Ease the motion (smoothstep) instead of constant speed. */
  ease?: boolean;
}

type TemplateOrFn = HandTemplate | ((i: number) => HandTemplate | null);

export class Seq {
  readonly frames: HandFrame[] = [];
  t: number;
  private readonly dt: number;
  private readonly rand: () => number;

  constructor(
    opts: {
      fps?: number;
      start?: number;
      seed?: number;
      videoWidth?: number;
      videoHeight?: number;
    } = {},
  ) {
    this.dt = 1000 / (opts.fps ?? 30);
    this.t = opts.start ?? 1000;
    this.rand = rng(opts.seed ?? 7);
    this.videoWidth = opts.videoWidth ?? 640;
    this.videoHeight = opts.videoHeight ?? 480;
  }

  readonly videoWidth: number;
  readonly videoHeight: number;

  private push(hands: HandObservation[]): void {
    this.frames.push({
      t: this.t,
      videoWidth: this.videoWidth,
      videoHeight: this.videoHeight,
      hands,
    });
    this.t += this.dt;
  }

  private observe(tpl: HandTemplate, center: Pt, o: SegmentOptions): HandObservation {
    const obs: HandObservation = {
      landmarks: placeHand(tpl, {
        center,
        scale: o.scale,
        rotationDeg: o.rotationDeg,
        noise: o.noise,
        rand: this.rand,
        videoWidth: this.videoWidth,
        videoHeight: this.videoHeight,
      }),
      handedness: 'Right',
      handednessScore: 0.98,
    };
    if (o.canned) obs.cannedGesture = { ...o.canned };
    return obs;
  }

  private frameCount(ms: number): number {
    return Math.max(1, Math.round(ms / this.dt));
  }

  /** Stationary hand for `ms`. A function template may return null for a no-hand frame. */
  hold(tpl: TemplateOrFn, at: Pt, ms: number, o: SegmentOptions = {}): this {
    return this.move(tpl, at, at, ms, o);
  }

  /** Move linearly (or eased) from `from` to `to` over `ms`. */
  move(tpl: TemplateOrFn, from: Pt, to: Pt, ms: number, o: SegmentOptions = {}): this {
    const n = this.frameCount(ms);
    for (let i = 0; i < n; i++) {
      let u = n === 1 ? 1 : (i + 1) / n;
      if (o.ease) u = u * u * (3 - 2 * u);
      const c = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u };
      const t = typeof tpl === 'function' ? tpl(i) : tpl;
      this.push(t ? [this.observe(t, c, o)] : []);
    }
    return this;
  }

  /** No hand in view for `ms`. */
  empty(ms: number): this {
    const n = this.frameCount(ms);
    for (let i = 0; i < n; i++) this.push([]);
    return this;
  }
}

export const CENTER: Pt = { x: 0.5, y: 0.5 };
