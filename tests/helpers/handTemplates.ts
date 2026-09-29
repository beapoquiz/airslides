/**
 * Synthetic 21-point hands for unit tests.
 *
 * Templates are authored in a "hand frame": wrist at the origin, palm size
 * (wrist → middle MCP) ≈ 1, fingers pointing up (−y), x to the presenter's
 * right in the mirrored display. `placeHand` scales, rotates and moves a
 * template into the frame and converts it to raw (un-mirrored) MediaPipe
 * normalized coordinates, exactly what an engine would output.
 */
import type { Landmark } from '../../src/engine/types';

export type TemplatePoint = readonly [number, number];
export type HandTemplate = readonly TemplatePoint[];

// prettier-ignore
export const OPEN_HAND: HandTemplate = [
  [0, 0],                                                  // 0 wrist
  [-0.35, -0.2], [-0.6, -0.45], [-0.8, -0.7], [-1.05, -0.95], // 1-4 thumb
  [-0.3, -0.95], [-0.35, -1.45], [-0.38, -1.75], [-0.4, -2.0], // 5-8 index
  [0, -1.0], [0, -1.55], [0, -1.9], [0, -2.15],             // 9-12 middle
  [0.25, -0.95], [0.3, -1.45], [0.33, -1.75], [0.35, -1.98], // 13-16 ring
  [0.48, -0.85], [0.58, -1.2], [0.64, -1.42], [0.7, -1.6],  // 17-20 pinky
];

/** Fingers curled into the palm; thumb wrapped across the front, not pointing up. */
// prettier-ignore
export const FIST: HandTemplate = [
  [0, 0],
  [-0.35, -0.2], [-0.55, -0.45], [-0.4, -0.6], [-0.15, -0.65],
  [-0.3, -0.95], [-0.33, -1.25], [-0.3, -1.0], [-0.28, -0.8],
  [0, -1.0], [0, -1.3], [0, -1.05], [0.02, -0.82],
  [0.25, -0.95], [0.28, -1.22], [0.26, -0.98], [0.24, -0.8],
  [0.48, -0.85], [0.52, -1.08], [0.5, -0.9], [0.46, -0.75],
];

/** Hand turned sideways, fingers curled, thumb pointing straight up. */
// prettier-ignore
export const THUMBS_UP: HandTemplate = [
  [0, 0],
  [0.35, -0.3], [0.6, -0.6], [0.64, -1.0], [0.67, -1.35],
  [0.9, -0.45], [1.2, -0.5], [1.15, -0.3], [1.0, -0.25],
  [0.97, -0.2], [1.25, -0.25], [1.18, -0.05], [1.02, 0.0],
  [0.9, 0.05], [1.18, 0.02], [1.1, 0.2], [0.95, 0.22],
  [0.8, 0.25], [1.05, 0.25], [0.98, 0.4], [0.85, 0.4],
];

/** "OK sign" pinch: thumb tip touches the bent index tip; other fingers extended. */
// prettier-ignore
export const PINCH: HandTemplate = [
  [0, 0],
  [-0.35, -0.2], [-0.6, -0.5], [-0.75, -0.9], [-0.75, -1.25],
  [-0.3, -0.95], [-0.45, -1.35], [-0.6, -1.45], [-0.72, -1.35],
  [0, -1.0], [0, -1.55], [0, -1.9], [0, -2.15],
  [0.25, -0.95], [0.3, -1.45], [0.33, -1.75], [0.35, -1.98],
  [0.48, -0.85], [0.58, -1.2], [0.64, -1.42], [0.7, -1.6],
];

/**
 * Relaxed talking hand: index + middle loosely extended, ring + pinky curled,
 * thumb resting. Should be "other" and not count as an open hand.
 */
// prettier-ignore
export const RELAXED: HandTemplate = [
  [0, 0],
  [-0.35, -0.2], [-0.55, -0.45], [-0.65, -0.7], [-0.6, -0.9],
  [-0.3, -0.95], [-0.38, -1.4], [-0.4, -1.65], [-0.4, -1.85],
  [0, -1.0], [0, -1.5], [0.02, -1.78], [0.03, -1.95],
  [0.25, -0.95], [0.3, -1.35], [0.3, -1.45], [0.3, -1.45],
  [0.48, -0.85], [0.55, -1.1], [0.55, -1.2], [0.52, -1.22],
];

/** Linear blend between two templates (t = 0 → a, t = 1 → b). */
export function blend(a: HandTemplate, b: HandTemplate, t: number): HandTemplate {
  return a.map(([ax, ay], i) => {
    const [bx, by] = b[i] as TemplatePoint;
    return [ax + (bx - ax) * t, ay + (by - ay) * t] as const;
  });
}

/** Deterministic PRNG (mulberry32) so noisy tests are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample from a uniform PRNG (Box–Muller). */
export function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface Placement {
  /** Palm centre in *display* coordinates, normalized [0,1] (x mirrored like the preview). */
  center: { x: number; y: number };
  /** Palm size as a fraction of frame height (≈0.15 at ~1 m from a laptop camera). */
  scale?: number;
  /** In-plane rotation, degrees (positive = clockwise on screen). */
  rotationDeg?: number;
  videoWidth?: number;
  videoHeight?: number;
  /** Gaussian noise σ, in palm sizes, added to every point. */
  noise?: number;
  rand?: () => number;
}

function templateCenter(tpl: HandTemplate): [number, number] {
  const ids = [0, 5, 9, 13, 17];
  let x = 0;
  let y = 0;
  for (const i of ids) {
    const p = tpl[i] as TemplatePoint;
    x += p[0];
    y += p[1];
  }
  return [x / ids.length, y / ids.length];
}

/** Place a template in the frame and return raw MediaPipe-style landmarks. */
export function placeHand(tpl: HandTemplate, p: Placement): Landmark[] {
  const w = p.videoWidth ?? 640;
  const h = p.videoHeight ?? 480;
  const aspect = w / h;
  const s = p.scale ?? 0.15;
  const th = ((p.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const [cx, cy] = templateCenter(tpl);
  const rand = p.rand ?? rng(1);
  const noise = p.noise ?? 0;

  return tpl.map(([tx, ty]) => {
    let x = tx - cx;
    let y = ty - cy;
    if (noise > 0) {
      x += gaussian(rand) * noise;
      y += gaussian(rand) * noise;
    }
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    // display space (aspect-corrected) → raw normalized, un-mirrored
    const X = p.center.x * aspect + rx * s;
    const Y = p.center.y + ry * s;
    return { x: 1 - X / aspect, y: Y, z: 0 };
  });
}
