import { describe, expect, it } from 'vitest';
import { OneEuroFilter, OneEuroFilter2D } from '../src/gestures/oneEuro';
import { gaussian, rng } from './helpers/handTemplates';

function std(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

describe('OneEuroFilter', () => {
  it('reduces jitter on a noisy constant signal', () => {
    const f = new OneEuroFilter(1.0, 0.02, 1.0);
    const rand = rng(42);
    const raw: number[] = [];
    const out: number[] = [];
    for (let i = 0; i < 300; i++) {
      const v = 320 + gaussian(rand) * 3; // ±3 px jitter around 320 px, 30 fps
      raw.push(v);
      out.push(f.filter(v, i * 33.3));
    }
    const settledRaw = raw.slice(60);
    const settledOut = out.slice(60);
    expect(std(settledOut)).toBeLessThan(std(settledRaw) * 0.5);
    const mean = settledOut.reduce((a, b) => a + b, 0) / settledOut.length;
    expect(mean).toBeCloseTo(320, 0);
  });

  it('follows a step change', () => {
    const f = new OneEuroFilter(1.0, 0.02, 1.0);
    let t = 0;
    for (let i = 0; i < 30; i++) f.filter(100, (t += 33.3));
    let y = 0;
    for (let i = 0; i < 45; i++) y = f.filter(400, (t += 33.3)); // 1.5 s after the step
    expect(Math.abs(y - 400)).toBeLessThan(400 * 0.03);
  });

  it('passes the first sample through and ignores non-increasing timestamps', () => {
    const f = new OneEuroFilter();
    expect(f.filter(5, 0)).toBe(5);
    expect(f.filter(50, 0)).toBe(5);
    f.reset();
    expect(f.filter(7, 10)).toBe(7);
  });

  it('2-D filter smooths both axes independently', () => {
    const f = new OneEuroFilter2D();
    f.filter(0, 0, 0);
    const p = f.filter(100, 50, 33);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(100);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(50);
  });
});
