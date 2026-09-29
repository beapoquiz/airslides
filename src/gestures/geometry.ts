import type { Landmark } from '../engine/types';
import { LM } from '../engine/types';

/** A 2-D point in *display space*: mirrored and aspect-corrected. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Convert raw normalized landmarks to display space.
 *
 * - Mirroring: the preview is shown mirrored (like a selfie), so the
 *   presenter's left is on the left of the screen. xDisplay = 1 − x.
 * - Aspect correction: normalized x and y have different pixel scales on a
 *   non-square frame, so x is multiplied by width/height before any distance
 *   math. The resulting x range is [0, aspect], y is [0, 1].
 */
export function toDisplayPoints(
  landmarks: readonly Landmark[],
  videoWidth: number,
  videoHeight: number,
): Vec2[] {
  const aspect = videoHeight > 0 ? videoWidth / videoHeight : 1;
  return landmarks.map((l) => ({ x: (1 - l.x) * aspect, y: l.y }));
}

/** Mirror a normalized x coordinate into display space (no aspect correction). */
export function mirrorX(x: number): number {
  return 1 - x;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pt(points: readonly Vec2[], i: number): Vec2 {
  const p = points[i];
  if (!p) throw new RangeError(`landmark ${i} missing (need 21 points, got ${points.length})`);
  return p;
}

/** Wrist → middle-finger MCP. The unit for every distance threshold. */
export function palmSize(points: readonly Vec2[]): number {
  return dist(pt(points, LM.WRIST), pt(points, LM.MIDDLE_MCP));
}

/** Mean of wrist and the four finger MCPs: stable while fingers move. */
export function palmCenter(points: readonly Vec2[]): Vec2 {
  const ids = [LM.WRIST, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP];
  let x = 0;
  let y = 0;
  for (const i of ids) {
    x += pt(points, i).x;
    y += pt(points, i).y;
  }
  return { x: x / ids.length, y: y / ids.length };
}

export type Finger = 'index' | 'middle' | 'ring' | 'pinky';

const FINGER_JOINTS: Record<Finger, { pip: number; tip: number }> = {
  index: { pip: LM.INDEX_PIP, tip: LM.INDEX_TIP },
  middle: { pip: LM.MIDDLE_PIP, tip: LM.MIDDLE_TIP },
  ring: { pip: LM.RING_PIP, tip: LM.RING_TIP },
  pinky: { pip: LM.PINKY_PIP, tip: LM.PINKY_TIP },
};

export const FINGERS: readonly Finger[] = ['index', 'middle', 'ring', 'pinky'];

/** Rotation-invariant: the tip is clearly farther from the wrist than the PIP joint. */
export function fingerExtended(points: readonly Vec2[], finger: Finger, ratio = 1.15): boolean {
  const { pip, tip } = FINGER_JOINTS[finger];
  const wrist = pt(points, LM.WRIST);
  return dist(wrist, pt(points, tip)) > dist(wrist, pt(points, pip)) * ratio;
}

export function countExtendedFingers(points: readonly Vec2[], ratio = 1.15): number {
  return FINGERS.reduce((n, f) => n + (fingerExtended(points, f, ratio) ? 1 : 0), 0);
}

/**
 * Thumb extended: the tip points away from the pinky side of the palm and is
 * spread away from the index knuckle.
 */
export function thumbExtended(points: readonly Vec2[], ratio = 1.1, minSpread = 0.6): boolean {
  const size = palmSize(points);
  if (size <= 0) return false;
  const tip = pt(points, LM.THUMB_TIP);
  const pinkyMcp = pt(points, LM.PINKY_MCP);
  return (
    dist(tip, pinkyMcp) > dist(pt(points, LM.THUMB_IP), pinkyMcp) * ratio &&
    dist(tip, pt(points, LM.INDEX_MCP)) / size > minSpread
  );
}

/** How far the thumb tip is above the thumb MCP, in palm sizes (image y grows downward). */
export function thumbRise(points: readonly Vec2[]): number {
  const size = palmSize(points);
  if (size <= 0) return 0;
  return (pt(points, LM.THUMB_MCP).y - pt(points, LM.THUMB_TIP).y) / size;
}

/** Thumb tip ↔ index tip distance in palm sizes. */
export function pinchRatio(points: readonly Vec2[]): number {
  const size = palmSize(points);
  if (size <= 0) return Infinity;
  return dist(pt(points, LM.THUMB_TIP), pt(points, LM.INDEX_TIP)) / size;
}

/** dist(wrist, indexTip) / dist(wrist, indexMCP): ≈1 in a fist, >1.2 when pinching. */
export function indexReach(points: readonly Vec2[]): number {
  const wrist = pt(points, LM.WRIST);
  const mcp = dist(wrist, pt(points, LM.INDEX_MCP));
  if (mcp <= 0) return 0;
  return dist(wrist, pt(points, LM.INDEX_TIP)) / mcp;
}

export function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Map a point in [0,1]² camera-display space to [0,1]² slide space, where only
 * the centred `region` fraction of the camera frame is used (the rest clamps
 * to the edges).
 */
export function mapActiveRegion(p: Vec2, region: number): Vec2 {
  const r = clamp(region, 0.05, 1);
  const lo = (1 - r) / 2;
  return { x: clamp((p.x - lo) / r, 0, 1), y: clamp((p.y - lo) / r, 0, 1) };
}
