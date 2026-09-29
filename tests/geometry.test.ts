import { describe, expect, it } from 'vitest';
import {
  countExtendedFingers,
  dist,
  fingerExtended,
  indexReach,
  mapActiveRegion,
  palmCenter,
  palmSize,
  pinchRatio,
  thumbExtended,
  toDisplayPoints,
} from '../src/gestures/geometry';
import { FIST, OPEN_HAND, PINCH, THUMBS_UP, placeHand } from './helpers/handTemplates';

const W = 640;
const H = 480;
const pts = (lms: ReturnType<typeof placeHand>, w = W, h = H) => toDisplayPoints(lms, w, h);

describe('palmSize', () => {
  it('is invariant to translation', () => {
    const a = palmSize(pts(placeHand(OPEN_HAND, { center: { x: 0.3, y: 0.4 } })));
    const b = palmSize(pts(placeHand(OPEN_HAND, { center: { x: 0.7, y: 0.6 } })));
    expect(b).toBeCloseTo(a, 10);
  });

  it('scales linearly with hand size, so palm-unit ratios are scale-invariant', () => {
    const small = pts(placeHand(OPEN_HAND, { center: { x: 0.5, y: 0.5 }, scale: 0.08 }));
    const large = pts(placeHand(OPEN_HAND, { center: { x: 0.5, y: 0.5 }, scale: 0.16 }));
    expect(palmSize(large) / palmSize(small)).toBeCloseTo(2, 10);
    expect(pinchRatio(large)).toBeCloseTo(pinchRatio(small), 10);
  });

  it('equals the template palm length times the scale', () => {
    const p = pts(placeHand(OPEN_HAND, { center: { x: 0.5, y: 0.5 }, scale: 0.2 }));
    expect(palmSize(p)).toBeCloseTo(0.2, 10);
  });

  it('is invariant to in-plane rotation', () => {
    const a = palmSize(pts(placeHand(OPEN_HAND, { center: { x: 0.5, y: 0.5 } })));
    const b = palmSize(pts(placeHand(OPEN_HAND, { center: { x: 0.5, y: 0.5 }, rotationDeg: 73 })));
    expect(b).toBeCloseTo(a, 10);
  });
});

describe('aspect correction', () => {
  it('makes normalized distances proportional to pixel distances', () => {
    // 0.1 of the width (64 px) vs 0.1 of the height (48 px) on a 640×480 frame
    const [o, r, d] = toDisplayPoints(
      [
        { x: 0.5, y: 0.5, z: 0 },
        { x: 0.6, y: 0.5, z: 0 },
        { x: 0.5, y: 0.6, z: 0 },
      ],
      W,
      H,
    );
    expect(dist(o!, r!) / dist(o!, d!)).toBeCloseTo(64 / 48, 10);
  });

  it('keeps palm size identical for a hand rotated 90° on a wide frame', () => {
    const upright = palmSize(
      pts(
        placeHand(OPEN_HAND, { center: { x: 0.5, y: 0.5 }, videoWidth: 1280, videoHeight: 720 }),
        1280,
        720,
      ),
    );
    const sideways = palmSize(
      pts(
        placeHand(OPEN_HAND, {
          center: { x: 0.5, y: 0.5 },
          rotationDeg: 90,
          videoWidth: 1280,
          videoHeight: 720,
        }),
        1280,
        720,
      ),
    );
    expect(sideways).toBeCloseTo(upright, 10);
  });
});

describe('mirroring', () => {
  it('maps raw x to display x = 1 − x (times aspect)', () => {
    const [p] = toDisplayPoints([{ x: 0.2, y: 0.3, z: 0 }], W, H);
    expect(p!.x).toBeCloseTo(0.8 * (W / H), 10);
    expect(p!.y).toBeCloseTo(0.3, 10);
  });

  it('turns the presenter moving toward their left into decreasing display x', () => {
    // placeHand takes display positions; moving the palm to display x=0.3 from 0.7
    const right = palmCenter(pts(placeHand(OPEN_HAND, { center: { x: 0.7, y: 0.5 } })));
    const left = palmCenter(pts(placeHand(OPEN_HAND, { center: { x: 0.3, y: 0.5 } })));
    expect(left.x).toBeLessThan(right.x);
    // …which in raw (un-mirrored) camera coordinates is *increasing* x
    const rawRight = placeHand(OPEN_HAND, { center: { x: 0.7, y: 0.5 } })[0]!.x;
    const rawLeft = placeHand(OPEN_HAND, { center: { x: 0.3, y: 0.5 } })[0]!.x;
    expect(rawLeft).toBeGreaterThan(rawRight);
  });
});

describe('palmCenter', () => {
  it('lands on the requested placement centre', () => {
    const c = palmCenter(pts(placeHand(OPEN_HAND, { center: { x: 0.25, y: 0.6 } })));
    expect(c.x).toBeCloseTo(0.25 * (W / H), 10);
    expect(c.y).toBeCloseTo(0.6, 10);
  });
});

describe('finger and thumb state', () => {
  const at = { center: { x: 0.5, y: 0.5 } };

  it('open hand: 4 fingers and thumb extended', () => {
    const p = pts(placeHand(OPEN_HAND, at));
    expect(countExtendedFingers(p)).toBe(4);
    expect(thumbExtended(p)).toBe(true);
  });

  it('fist: no fingers extended, thumb tucked', () => {
    const p = pts(placeHand(FIST, at));
    expect(countExtendedFingers(p)).toBe(0);
    expect(fingerExtended(p, 'index')).toBe(false);
    expect(thumbExtended(p)).toBe(false);
  });

  it('thumbs up: thumb extended, fingers curled', () => {
    const p = pts(placeHand(THUMBS_UP, at));
    expect(countExtendedFingers(p)).toBe(0);
    expect(thumbExtended(p)).toBe(true);
  });

  it('pinch: small thumb–index ratio with a reaching index finger', () => {
    const p = pts(placeHand(PINCH, at));
    expect(pinchRatio(p)).toBeLessThan(0.35);
    expect(indexReach(p)).toBeGreaterThan(1.1);
  });

  it('fist: thumb and index tips are also close, but the index does not reach', () => {
    const p = pts(placeHand(FIST, at));
    expect(pinchRatio(p)).toBeLessThan(0.35); // why the reach guard exists
    expect(indexReach(p)).toBeLessThan(1.1);
  });
});

describe('mapActiveRegion', () => {
  it('maps the centre to the centre and clamps outside the region', () => {
    expect(mapActiveRegion({ x: 0.5, y: 0.5 }, 0.7)).toEqual({ x: 0.5, y: 0.5 });
    expect(mapActiveRegion({ x: 0.15, y: 0.85 }, 0.7)).toEqual({ x: 0, y: 1 });
    expect(mapActiveRegion({ x: 0.0, y: 1.0 }, 0.7)).toEqual({ x: 0, y: 1 });
    const q = mapActiveRegion({ x: 0.325, y: 0.675 }, 0.7);
    expect(q.x).toBeCloseTo(0.25, 10);
    expect(q.y).toBeCloseTo(0.75, 10);
  });
});
