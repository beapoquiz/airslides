import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { HoldDetector } from '../src/gestures/hold';

const DT = 1000 / 30;
const C = { x: 0.6, y: 0.5 };
const PALM = 0.15;

/** Drive a detector for `ms`; `present(i)` decides each frame. Returns fire times. */
function drive(
  d: HoldDetector,
  start: number,
  ms: number,
  present: (i: number) => boolean,
  center: (i: number) => { x: number; y: number } = () => C,
): { fires: number[]; end: number; maxProgress: number } {
  const fires: number[] = [];
  let t = start;
  let maxProgress = 0;
  const n = Math.round(ms / DT);
  for (let i = 0; i < n; i++) {
    t += DT;
    if (d.update(t, present(i), center(i), PALM)) fires.push(t);
    maxProgress = Math.max(maxProgress, d.progress);
  }
  return { fires, end: t, maxProgress };
}

describe('HoldDetector', () => {
  it('fires once after the hold duration plus the confirmation window', () => {
    const d = new HoldDetector('open_palm', DEFAULT_CONFIG);
    const { fires } = drive(d, 0, 2500, () => true);
    expect(fires).toHaveLength(1);
    const due = DEFAULT_CONFIG.holdDurationMs + DEFAULT_CONFIG.holdConfirmMs;
    expect(fires[0]!).toBeGreaterThanOrEqual(due);
    expect(fires[0]!).toBeLessThan(due + 3 * DT);
  });

  it('reports progress between 0 and 1 while holding', () => {
    const d = new HoldDetector('open_palm', DEFAULT_CONFIG);
    drive(d, 0, 500, () => true);
    expect(d.progress).toBeGreaterThan(0.4);
    expect(d.progress).toBeLessThan(0.6);
  });

  it('does not fire while the hand is moving', () => {
    const d = new HoldDetector('open_palm', DEFAULT_CONFIG);
    // 2 palm sizes per second — an open hand gliding across the frame
    const { fires, maxProgress } = drive(
      d,
      0,
      3000,
      () => true,
      (i) => ({ x: C.x - ((i * DT) / 1000) * 2 * PALM, y: C.y }),
    );
    expect(fires).toHaveLength(0);
    expect(maxProgress).toBeLessThan(0.5);
  });

  it('tolerates dropouts under 20 %', () => {
    const d = new HoldDetector('open_palm', DEFAULT_CONFIG);
    const { fires } = drive(d, 0, 1500, (i) => i % 10 !== 5); // 10 % of frames missing
    expect(fires).toHaveLength(1);
  });

  it('gives up when the pose is missing too often', () => {
    const d = new HoldDetector('open_palm', DEFAULT_CONFIG);
    const { fires } = drive(d, 0, 3000, (i) => i % 3 !== 0); // 33 % missing
    expect(fires).toHaveLength(0);
  });

  it('requires the pose to be released before firing again', () => {
    const d = new HoldDetector('fist', DEFAULT_CONFIG);
    let r = drive(d, 0, 3000, () => true);
    expect(r.fires).toHaveLength(1);

    // brief release (< 300 ms) then hold again: still latched
    r = drive(d, r.end, 150, () => false);
    r = drive(d, r.end, 1500, () => true);
    expect(r.fires).toHaveLength(0);

    // proper release (≥ 300 ms) then hold: fires again
    r = drive(d, r.end, 400, () => false);
    r = drive(d, r.end, 1600, () => true);
    expect(r.fires).toHaveLength(1);
  });

  it('a movement during the confirmation window cancels the hold (swipe hidden by frozen landmarks)', () => {
    const d = new HoldDetector('open_palm', DEFAULT_CONFIG);
    // still for 1.1 s (ring full), then the hand moves away fast
    const still = drive(d, 0, 1100, () => true);
    expect(still.fires).toHaveLength(0);
    expect(d.progress).toBe(1);
    const moved = drive(
      d,
      still.end,
      300,
      () => true,
      (i) => ({ x: C.x - (i + 1) * 0.5 * PALM, y: C.y }),
    );
    expect(moved.fires).toHaveLength(0);
  });

  it('respects a custom duration', () => {
    const d = new HoldDetector('thumbs_up', { ...DEFAULT_CONFIG, holdDurationMs: 2000 });
    const early = drive(d, 0, 1500, () => true);
    expect(early.fires).toHaveLength(0);
    const later = drive(d, early.end, 1000, () => true); // 2000 + 300 confirm
    expect(later.fires).toHaveLength(1);
  });
});
