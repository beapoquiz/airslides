import { describe, expect, it } from 'vitest';
import { GestureController } from '../src/gestures/controller';
import { FIST, OPEN_HAND, PINCH, RELAXED, THUMBS_UP } from './helpers/handTemplates';
import { actions, run } from './helpers/run';
import { CENTER, Seq, type Pt } from './helpers/synth';

const RIGHT: Pt = { x: 0.75, y: 0.5 };
const LEFT: Pt = { x: 0.3, y: 0.5 };

const swipeLeft = (s: Seq) =>
  s.hold(OPEN_HAND, RIGHT, 300).move(OPEN_HAND, RIGHT, LEFT, 250).hold(OPEN_HAND, LEFT, 300);
// holds fire after holdDurationMs (1 s) + holdConfirmMs (0.3 s)
const hold = (s: Seq, tpl = OPEN_HAND, ms = 1700) => s.hold(tpl, CENTER, ms);
/** A neutral pose between gestures, long enough to release any hold latch. */
const rest = (s: Seq, ms = 500) => s.hold(RELAXED, CENTER, ms);
const pinchMove = (s: Seq) => s.move(PINCH, { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }, 600);

describe('GestureController — holds', () => {
  it('open palm held still toggles blackout', () => {
    const { events } = run(rest(hold(new Seq(), OPEN_HAND)).frames);
    expect(actions(events)).toEqual(['toggleBlackout']);
    expect(events.find((e) => e.type === 'toggleBlackout')?.payload).toEqual({ active: true });
  });

  it('thumbs up held still toggles the timer', () => {
    const { count } = run(rest(hold(new Seq(), THUMBS_UP)).frames);
    expect(count('toggleTimer')).toBe(1);
  });

  it('emits hold progress that rises toward 1 and resets', () => {
    const { events } = run(rest(hold(new Seq(), THUMBS_UP)).frames);
    const prog = events
      .filter((e) => e.type === 'holdProgress')
      .map((e) => e.payload as { progress: number });
    expect(Math.max(...prog.map((p) => p.progress))).toBeGreaterThan(0.9);
    expect(prog.at(-1)!.progress).toBe(0);
  });

  it('works from landmarks alone (no canned gesture) and with a confident canned label', () => {
    // relaxed-looking landmarks, but MediaPipe says Closed_Fist with high confidence
    const s = new Seq().hold(RELAXED, CENTER, 1700, {
      canned: { name: 'Closed_Fist', score: 0.92 },
    });
    const { events } = run(s.frames);
    expect(events.find((e) => e.type === 'toggleLock')?.payload).toEqual({ locked: true });
  });
});

describe('GestureController — lock', () => {
  it('fist-hold locks; while locked only fist-hold works', () => {
    const s = new Seq();
    hold(s, FIST); // lock
    rest(s);
    swipeLeft(s); // ignored
    rest(s);
    hold(s, OPEN_HAND); // ignored (no blackout)
    rest(s);
    hold(s, THUMBS_UP); // ignored (no timer)
    rest(s);
    pinchMove(s); // ignored (no laser)
    rest(s);
    hold(s, FIST); // unlock
    rest(s);
    swipeLeft(s); // works again
    const { events, controller } = run(s.frames);
    expect(actions(events)).toEqual(['toggleLock', 'toggleLock', 'next']);
    const locks = events.filter((e) => e.type === 'toggleLock').map((e) => e.payload);
    expect(locks).toEqual([{ locked: true }, { locked: false }]);
    expect(events.some((e) => e.type === 'laserMove')).toBe(false);
    expect(controller.state).toBe('ACTIVE');
  });

  it('reports the LOCKED state even with no hand in view', () => {
    const s = new Seq();
    hold(s, FIST).empty(600);
    const { controller } = run(s.frames);
    expect(controller.locked).toBe(true);
    expect(controller.state).toBe('LOCKED');
  });

  it('toggleLock() (keyboard) has the same effect', () => {
    const c = new GestureController();
    c.toggleLock();
    const { count } = run(swipeLeft(new Seq()).frames, c);
    expect(count('next')).toBe(0);
    expect(c.state).toBe('LOCKED');
  });
});

describe('GestureController — blackout', () => {
  it('during blackout only palm-hold (restore) and fist-hold (lock) work', () => {
    const s = new Seq();
    hold(s, OPEN_HAND); // blackout on
    rest(s);
    swipeLeft(s); // ignored
    rest(s);
    hold(s, THUMBS_UP); // ignored
    rest(s);
    pinchMove(s); // ignored
    rest(s);
    hold(s, OPEN_HAND); // blackout off
    rest(s);
    const { events } = run(s.frames);
    expect(actions(events)).toEqual(['toggleBlackout', 'toggleBlackout']);
    expect(events.filter((e) => e.type === 'toggleBlackout').map((e) => e.payload)).toEqual([
      { active: true },
      { active: false },
    ]);
  });

  it('fist-hold still locks during blackout', () => {
    const s = new Seq();
    rest(hold(s, OPEN_HAND));
    hold(s, FIST);
    const { events, controller } = run(s.frames);
    expect(actions(events)).toEqual(['toggleBlackout', 'toggleLock']);
    expect(controller.state).toBe('LOCKED');
    expect(controller.blackout).toBe(true);
  });

  it('an open hand left raised after a swipe does not black out', () => {
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 300)
      .move(OPEN_HAND, RIGHT, LEFT, 250)
      .hold(OPEN_HAND, LEFT, 2500); // presenter keeps the palm up while talking
    const { count } = run(s.frames);
    expect(count('next')).toBe(1);
    expect(count('toggleBlackout')).toBe(0);
  });

  it('after a swipe, lowering the hand re-arms the palm hold', () => {
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 300)
      .move(OPEN_HAND, RIGHT, LEFT, 250)
      .hold(OPEN_HAND, LEFT, 300)
      .empty(500) // hand lowered out of view
      .hold(OPEN_HAND, CENTER, 1700);
    const { count } = run(s.frames);
    expect(count('next')).toBe(1);
    expect(count('toggleBlackout')).toBe(1);
  });

  it('resting an open hand ~1 s and then swiping navigates instead of blacking out', () => {
    // MediaPipe freezes the landmarks as the swipe starts, so the resting hand
    // looks still a little longer; the hold's confirmation window absorbs that.
    const s = new Seq()
      .hold(OPEN_HAND, RIGHT, 1000) // presenter pauses, palm raised
      .hold(OPEN_HAND, RIGHT, 180) // swipe has started; landmarks frozen
      .hold(OPEN_HAND, LEFT, 600); // tracker catches up in one step
    const { count } = run(s.frames);
    expect(count('next')).toBe(1);
    expect(count('toggleBlackout')).toBe(0);
  });

  it('keeps holding the palm after blackout does not toggle it back', () => {
    const { count } = run(hold(new Seq(), OPEN_HAND, 3500).frames);
    expect(count('toggleBlackout')).toBe(1);
  });
});

describe('GestureController — pinch / laser', () => {
  it('pinching moves the laser and suppresses swipes', () => {
    const s = new Seq()
      .hold(PINCH, RIGHT, 300)
      .move(PINCH, RIGHT, LEFT, 250) // would be a swipe if the hand were open
      .hold(PINCH, LEFT, 300)
      .hold(OPEN_HAND, LEFT, 300);
    const { events, count } = run(s.frames);
    expect(count('next') + count('prev')).toBe(0);
    expect(count('laserMove')).toBeGreaterThan(10);
    expect(count('laserEnd')).toBe(1);
    const states = events
      .filter((e) => e.type === 'stateChange')
      .map((e) => (e.payload as { state: string }).state);
    expect(states).toContain('PINCHING');
  });

  it('suppresses holds while pinching', () => {
    const { count } = run(new Seq().hold(PINCH, CENTER, 2000).frames);
    expect(count('toggleBlackout') + count('toggleLock') + count('toggleTimer')).toBe(0);
  });

  it('maps the pinch point through the active region into slide space', () => {
    const { events } = run(new Seq().hold(PINCH, CENTER, 600).frames);
    const last = events.filter((e) => e.type === 'laserMove').at(-1)!.payload as {
      x: number;
      y: number;
    };
    // the pinch point sits up-left of the palm centre in the template
    expect(last.x).toBeGreaterThan(0);
    expect(last.x).toBeLessThan(0.5);
    expect(last.y).toBeGreaterThan(0);
    expect(last.y).toBeLessThan(0.5);
    for (const e of events.filter((ev) => ev.type === 'laserMove')) {
      const p = e.payload as { x: number; y: number };
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
    }
  });

  it('a fist is never mistaken for a pinch (index-reach guard)', () => {
    const { count, controller } = run(new Seq().hold(FIST, CENTER, 500).frames);
    expect(controller.debug.pinchRatio!).toBeLessThan(0.35);
    expect(count('laserMove')).toBe(0);
  });
});

describe('GestureController — hand lost', () => {
  it('goes NO_HAND → ACTIVE → NO_HAND', () => {
    const s = new Seq().empty(100).hold(RELAXED, CENTER, 300).empty(500);
    const { events } = run(s.frames);
    const states = events
      .filter((e) => e.type === 'stateChange')
      .map((e) => (e.payload as { state: string }).state);
    expect(states).toEqual(['ACTIVE', 'NO_HAND']);
  });

  it('a hand lost for > 300 ms resets hold progress', () => {
    const s = new Seq().hold(OPEN_HAND, CENTER, 700).empty(400).hold(OPEN_HAND, CENTER, 500);
    expect(run(s.frames).count('toggleBlackout')).toBe(0);
  });

  it('a short dropout (< 200 ms) does not break a hold', () => {
    const s = new Seq().hold(OPEN_HAND, CENTER, 800).empty(130).hold(OPEN_HAND, CENTER, 800);
    expect(run(s.frames).count('toggleBlackout')).toBe(1);
  });

  it('losing the hand while pinching ends the laser', () => {
    const s = new Seq().hold(PINCH, CENTER, 300).empty(500);
    const { count, controller } = run(s.frames);
    expect(count('laserEnd')).toBe(1);
    expect(controller.pinching).toBe(false);
  });
});

describe('GestureController — config', () => {
  it('applies new thresholds at runtime', () => {
    const c = new GestureController();
    c.setConfig({ holdDurationMs: 2500 });
    expect(run(hold(new Seq(), OPEN_HAND, 1500).frames, c).count('toggleBlackout')).toBe(0);
  });
});
