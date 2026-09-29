import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { PinchDetector, type PinchTransition } from '../src/gestures/pinch';

function feed(d: PinchDetector, ratios: (number | null)[]): PinchTransition[] {
  return ratios.map((r) => d.update(r));
}

describe('PinchDetector', () => {
  it('enters after 2 consecutive frames below the enter threshold', () => {
    const d = new PinchDetector(DEFAULT_CONFIG);
    expect(feed(d, [0.8, 0.3, 0.3])).toEqual([null, null, 'start']);
    expect(d.pinching).toBe(true);
  });

  it('debounces a single-frame dip', () => {
    const d = new PinchDetector(DEFAULT_CONFIG);
    feed(d, [0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8]);
    expect(d.pinching).toBe(false);
  });

  it('does not flicker when the ratio hovers around the enter threshold', () => {
    const d = new PinchDetector(DEFAULT_CONFIG);
    const out = feed(d, [0.3, 0.3, 0.36, 0.34, 0.36, 0.34, 0.4, 0.34, 0.45]);
    expect(out.filter((x) => x !== null)).toEqual(['start']); // entered once, never left
    expect(d.pinching).toBe(true);
  });

  it('stays pinched between the thresholds (hysteresis)', () => {
    const d = new PinchDetector(DEFAULT_CONFIG);
    feed(d, [0.2, 0.2]);
    const out = feed(d, [0.4, 0.45, 0.49, 0.42, 0.48, 0.47]);
    expect(out.every((x) => x === null)).toBe(true);
    expect(d.pinching).toBe(true);
  });

  it('does not exit on alternating frames around the exit threshold', () => {
    const d = new PinchDetector(DEFAULT_CONFIG);
    feed(d, [0.2, 0.2]);
    feed(d, [0.55, 0.45, 0.55, 0.45, 0.55, 0.45]);
    expect(d.pinching).toBe(true);
  });

  it('exits after 2 consecutive frames above the exit threshold', () => {
    const d = new PinchDetector(DEFAULT_CONFIG);
    feed(d, [0.2, 0.2]);
    expect(feed(d, [0.6, 0.6])).toEqual([null, 'end']);
    expect(d.pinching).toBe(false);
  });

  it('treats null (not allowed) as open', () => {
    const d = new PinchDetector(DEFAULT_CONFIG);
    feed(d, [0.2, null, 0.2]);
    expect(d.pinching).toBe(false);
    feed(d, [0.2, 0.2]);
    expect(feed(d, [null, null])).toEqual([null, 'end']);
  });
});
