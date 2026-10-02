import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { SwipeDetector } from '../src/gestures/swipe';
import { FIST, OPEN_HAND, RELAXED } from './helpers/handTemplates';
import { run } from './helpers/run';
import { Seq, type Pt } from './helpers/synth';

const RIGHT: Pt = { x: 0.75, y: 0.5 };
const LEFT: Pt = { x: 0.3, y: 0.5 };

/** Open hand rests, flicks to the presenter's left, rests. */
function swipeLeft(seq = new Seq(), ms = 250) {
  return seq
    .hold(OPEN_HAND, RIGHT, 400)
    .move(OPEN_HAND, RIGHT, LEFT, ms)
    .hold(OPEN_HAND, LEFT, 600);
}

describe('swipe (through the controller)', () => {
  it('swipe left fires exactly one "next"', () => {
    const { count } = run(swipeLeft().frames);
    expect(count('next')).toBe(1);
    expect(count('prev')).toBe(0);
  });

  it('swipe right fires exactly one "prev"', () => {
    const s = new Seq()
      .hold(OPEN_HAND, LEFT, 400)
      .move(OPEN_HAND, LEFT, RIGHT, 250)
      .hold(OPEN_HAND, RIGHT, 600);
    const { count } = run(s.frames);
    expect(count('prev')).toBe(1);
    expect(count('next')).toBe(0);
  });

  it('works near and far from the camera (palm-size normalization)', () => {
    const near = new Seq()
      .hold(OPEN_HAND, { x: 0.8, y: 0.5 }, 400, { scale: 0.3 })
      .move(OPEN_HAND, { x: 0.8, y: 0.5 }, { x: 0.2, y: 0.5 }, 250, { scale: 0.3 })
      .hold(OPEN_HAND, { x: 0.2, y: 0.5 }, 500, { scale: 0.3 });
    const far = new Seq()
      .hold(OPEN_HAND, { x: 0.6, y: 0.5 }, 400, { scale: 0.08 })
      .move(OPEN_HAND, { x: 0.6, y: 0.5 }, { x: 0.4, y: 0.5 }, 250, { scale: 0.08 })
      .hold(OPEN_HAND, { x: 0.4, y: 0.5 }, 500, { scale: 0.08 });
    expect(run(near.frames).count('next')).toBe(1);
    expect(run(far.frames).count('next')).toBe(1);
  });

  it('tolerates noise and an eased (realistic) velocity profile', () => {
    const s = new Seq({ seed: 3 })
      .hold(OPEN_HAND, RIGHT, 400, { noise: 0.03 })
      .move(OPEN_HAND, RIGHT, LEFT, 300, { noise: 0.03, ease: true })
      .hold(OPEN_HAND, LEFT, 600, { noise: 0.03 });
    const { count } = run(s.frames);
    expect(count('next')).toBe(1);
    expect(count('prev')).toBe(0);
  });

  it('slow drift does not fire', () => {
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 300)
      .move(OPEN_HAND, RIGHT, LEFT, 3000)
      .hold(OPEN_HAND, LEFT, 300);
    expect(run(s.frames).count('next')).toBe(0);
  });

  it('vertical motion does not fire', () => {
    const s = new Seq()
      .hold(OPEN_HAND, { x: 0.5, y: 0.2 }, 300)
      .move(OPEN_HAND, { x: 0.5, y: 0.2 }, { x: 0.55, y: 0.85 }, 250)
      .hold(OPEN_HAND, { x: 0.55, y: 0.85 }, 300);
    const { count } = run(s.frames);
    expect(count('next') + count('prev')).toBe(0);
  });

  it('a diagonal motion that is mostly vertical does not fire', () => {
    const s = new Seq()
      .hold(OPEN_HAND, { x: 0.6, y: 0.1 }, 300)
      .move(OPEN_HAND, { x: 0.6, y: 0.1 }, { x: 0.4, y: 0.9 }, 250)
      .hold(OPEN_HAND, { x: 0.4, y: 0.9 }, 300);
    const { count } = run(s.frames);
    expect(count('next') + count('prev')).toBe(0);
  });

  it('the return stroke after a swipe does not fire the opposite direction', () => {
    const s = swipeLeft(new Seq(), 250);
    // replace the rest with an immediate natural swing back
    const t = new Seq()
      .hold(OPEN_HAND, RIGHT, 400)
      .move(OPEN_HAND, RIGHT, LEFT, 250)
      .hold(OPEN_HAND, LEFT, 100)
      .move(OPEN_HAND, LEFT, RIGHT, 300)
      .hold(OPEN_HAND, RIGHT, 1500);
    expect(run(s.frames).count('next')).toBe(1);
    const { count } = run(t.frames);
    expect(count('next')).toBe(1);
    expect(count('prev')).toBe(0);
  });

  it('a delayed return stroke inside the suppression window does not fire either', () => {
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 400)
      .move(OPEN_HAND, RIGHT, LEFT, 250)
      .hold(OPEN_HAND, LEFT, 400) // swing back starts ~0.5 s after the trigger
      .move(OPEN_HAND, LEFT, RIGHT, 250)
      .hold(OPEN_HAND, RIGHT, 1500);
    const { count } = run(s.frames);
    expect(count('next')).toBe(1);
    expect(count('prev')).toBe(0);
  });

  it('a deliberate opposite swipe after the suppression window does fire', () => {
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 400)
      .move(OPEN_HAND, RIGHT, LEFT, 250)
      .hold(OPEN_HAND, LEFT, 1300)
      .move(OPEN_HAND, LEFT, RIGHT, 250)
      .hold(OPEN_HAND, RIGHT, 500);
    const { events } = run(s.frames);
    expect(events.filter((e) => e.type === 'next' || e.type === 'prev').map((e) => e.type)).toEqual(
      ['next', 'prev'],
    );
  });

  it('a hand entering the frame does not fire', () => {
    // hand appears already moving fast toward the centre, then settles
    const s = new Seq()
      .empty(500)
      .move(OPEN_HAND, { x: 0.95, y: 0.5 }, { x: 0.72, y: 0.5 }, 170)
      .hold(OPEN_HAND, { x: 0.72, y: 0.5 }, 600);
    const { count } = run(s.frames);
    expect(count('next') + count('prev')).toBe(0);
  });

  it('raising a hand from the bottom of the frame does not fire', () => {
    const s = new Seq()
      .empty(300)
      .move(OPEN_HAND, { x: 0.6, y: 0.98 }, { x: 0.5, y: 0.5 }, 350)
      .hold(OPEN_HAND, { x: 0.5, y: 0.5 }, 500);
    const { count } = run(s.frames);
    expect(count('next') + count('prev')).toBe(0);
  });

  it('a closed hand or a relaxed talking hand does not swipe', () => {
    for (const tpl of [FIST, RELAXED]) {
      const s = new Seq().hold(tpl, RIGHT, 400).move(tpl, RIGHT, LEFT, 250).hold(tpl, LEFT, 600);
      const { count } = run(s.frames);
      expect(count('next') + count('prev')).toBe(0);
    }
  });

  it('motion made with a closed hand does not count once the hand opens', () => {
    // fist travels left fast, then opens at rest: no swipe
    const s = new Seq()
      .hold(FIST, RIGHT, 300)
      .move(FIST, RIGHT, LEFT, 250)
      .hold(OPEN_HAND, LEFT, 500);
    const { count } = run(s.frames);
    expect(count('next') + count('prev')).toBe(0);
  });

  // The next cases mirror what real MediaPipe output looks like during fast,
  // motion-blurred swipes (captured from the engine, see docs/DECISIONS.md):
  // landmarks freeze, the hand drops out, then it reappears at the far side.

  it('frozen landmarks followed by a one-step leap (tracker lag) count as a swipe', () => {
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 600) // at rest
      .hold(OPEN_HAND, RIGHT, 150) // hand already moving, landmarks frozen
      .hold(OPEN_HAND, LEFT, 500); // reported at the far side in one step
    const { count } = run(s.frames);
    expect(count('next')).toBe(1);
    expect(count('prev')).toBe(0);
  });

  it('a swipe hidden by a dropout of up to ~270 ms still fires', () => {
    const s = new Seq().hold(OPEN_HAND, RIGHT, 500).empty(270).hold(OPEN_HAND, LEFT, 500);
    expect(run(s.frames).count('next')).toBe(1);
  });

  it('a dropout longer than the hand-lost limit does not fire', () => {
    const s = new Seq().hold(OPEN_HAND, RIGHT, 500).empty(400).hold(OPEN_HAND, LEFT, 500);
    const { count } = run(s.frames);
    expect(count('next') + count('prev')).toBe(0);
  });

  it('a mostly vertical leap does not fire', () => {
    const s = new Seq()
      .hold(OPEN_HAND, { x: 0.5, y: 0.2 }, 500)
      .hold(OPEN_HAND, { x: 0.56, y: 0.8 }, 500);
    const { count } = run(s.frames);
    expect(count('next') + count('prev')).toBe(0);
  });

  it('a leap to a much bigger hand (someone close to the camera) does not fire', () => {
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 500, { scale: 0.1 })
      .hold(OPEN_HAND, LEFT, 500, { scale: 0.3 });
    const { count } = run(s.frames);
    expect(count('next') + count('prev')).toBe(0);
  });

  it('palm size distorted by blur mid-swipe does not break detection', () => {
    const MID = { x: 0.52, y: 0.5 };
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 400)
      .move(OPEN_HAND, RIGHT, MID, 120)
      .move(OPEN_HAND, MID, LEFT, 120, { scale: 0.09 }) // blur shrinks the hand
      .hold(OPEN_HAND, LEFT, 400);
    expect(run(s.frames).count('next')).toBe(1);
  });

  it('a slow swing-back that outlasts the suppression window does not fire', () => {
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 400)
      .move(OPEN_HAND, RIGHT, LEFT, 220)
      .hold(OPEN_HAND, LEFT, 450)
      .move(OPEN_HAND, LEFT, RIGHT, 900) // still moving 1.5 s after the swipe
      .hold(OPEN_HAND, RIGHT, 600);
    const { count } = run(s.frames);
    expect(count('next')).toBe(1);
    expect(count('prev')).toBe(0);
  });

  it('two deliberate swipes in the same direction ~0.6 s apart both fire', () => {
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 400)
      .move(OPEN_HAND, RIGHT, LEFT, 180)
      .hold(OPEN_HAND, LEFT, 100)
      .move(OPEN_HAND, LEFT, RIGHT, 180) // swing back (suppressed)
      .hold(OPEN_HAND, RIGHT, 100)
      .move(OPEN_HAND, RIGHT, LEFT, 180)
      .hold(OPEN_HAND, LEFT, 400);
    const { count } = run(s.frames);
    expect(count('next')).toBe(2);
    expect(count('prev')).toBe(0);
  });

  it('one long sweep across the frame fires only once', () => {
    const s = new Seq()
      .hold(OPEN_HAND, { x: 0.92, y: 0.5 }, 400)
      .move(OPEN_HAND, { x: 0.92, y: 0.5 }, { x: 0.08, y: 0.5 }, 1000)
      .hold(OPEN_HAND, { x: 0.08, y: 0.5 }, 400);
    const { count } = run(s.frames);
    expect(count('next')).toBe(1);
    expect(count('prev')).toBe(0);
  });

  it('a real swipe that blurs out for a few frames mid-motion still fires', () => {
    const blurOut = (i: number) => (i >= 4 && i <= 6 ? null : OPEN_HAND); // 3 frames lost
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 400)
      .move(blurOut, RIGHT, LEFT, 300)
      .hold(OPEN_HAND, LEFT, 500);
    expect(run(s.frames).count('next')).toBe(1);
  });

  it('a very fast but physically plausible flick still fires', () => {
    // 0.45 of the frame width in 100 ms ≈ 40 palm sizes/s peak with easing
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 400)
      .move(OPEN_HAND, RIGHT, LEFT, 130)
      .hold(OPEN_HAND, LEFT, 500);
    expect(run(s.frames).count('next')).toBe(1);
  });

  it('tolerates a couple of motion-blurred frames mid-swipe', () => {
    const blurry = (i: number) => (i === 3 || i === 4 ? RELAXED : OPEN_HAND);
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 400)
      .move(blurry, RIGHT, LEFT, 250)
      .hold(OPEN_HAND, LEFT, 500);
    expect(run(s.frames).count('next')).toBe(1);
  });

  it('respects the cooldown between swipes', () => {
    // left, immediate swing back, left again ~0.5 s after the first trigger
    const quick = new Seq()
      .hold(OPEN_HAND, RIGHT, 400)
      .move(OPEN_HAND, RIGHT, LEFT, 200)
      .move(OPEN_HAND, LEFT, RIGHT, 200)
      .move(OPEN_HAND, RIGHT, LEFT, 200)
      .hold(OPEN_HAND, LEFT, 500);
    expect(run(quick.frames).count('next')).toBe(1);

    const spaced = new Seq()
      .hold(OPEN_HAND, RIGHT, 400)
      .move(OPEN_HAND, RIGHT, LEFT, 200)
      .move(OPEN_HAND, LEFT, RIGHT, 200)
      .hold(OPEN_HAND, RIGHT, 1000)
      .move(OPEN_HAND, RIGHT, LEFT, 200)
      .hold(OPEN_HAND, LEFT, 500);
    const r = run(spaced.frames);
    expect(r.count('next')).toBe(2);
    expect(r.count('prev')).toBe(0);
  });

  it('invertSwipe maps a left swipe to "prev"', () => {
    const { count } = run(swipeLeft().frames, { invertSwipe: true });
    expect(count('prev')).toBe(1);
    expect(count('next')).toBe(0);
  });
});

describe('SwipeDetector (direct)', () => {
  it('reports direction in display space and fires once per motion', () => {
    const d = new SwipeDetector(DEFAULT_CONFIG);
    const out: (string | null)[] = [];
    let t = 0;
    for (let i = 0; i < 15; i++) out.push(d.update((t += 33), { x: 1, y: 0.5 }, 0.15, true, true));
    for (let i = 1; i <= 8; i++)
      out.push(d.update((t += 33), { x: 1 - i * 0.06, y: 0.5 }, 0.15, true, true));
    for (let i = 0; i < 10; i++)
      out.push(d.update((t += 33), { x: 0.52, y: 0.5 }, 0.15, true, true));
    expect(out.filter(Boolean)).toEqual(['left']);
  });

  it('clears its history while not eligible', () => {
    const d = new SwipeDetector(DEFAULT_CONFIG);
    let t = 0;
    for (let i = 0; i < 10; i++) d.update((t += 33), { x: 1, y: 0.5 }, 0.15, true, true);
    // the fast motion happens while ineligible (e.g. pinching) …
    for (let i = 1; i <= 8; i++)
      d.update((t += 33), { x: 1 - i * 0.06, y: 0.5 }, 0.15, true, false);
    // … so becoming eligible again at rest must not fire
    const out: (string | null)[] = [];
    for (let i = 0; i < 10; i++)
      out.push(d.update((t += 33), { x: 0.52, y: 0.5 }, 0.15, true, true));
    expect(out.filter(Boolean)).toEqual([]);
  });
});
