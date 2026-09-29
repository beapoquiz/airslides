import { describe, expect, it } from 'vitest';
import { toDisplayPoints } from '../src/gestures/geometry';
import { cannedToPose, classifyPose, resolvePose, type Pose } from '../src/gestures/pose';
import {
  FIST,
  OPEN_HAND,
  PINCH,
  RELAXED,
  THUMBS_UP,
  placeHand,
  rng,
  type HandTemplate,
} from './helpers/handTemplates';

const cases: [string, HandTemplate, Pose][] = [
  ['open hand', OPEN_HAND, 'open_palm'],
  ['fist', FIST, 'fist'],
  ['thumbs up', THUMBS_UP, 'thumbs_up'],
];

function classify(tpl: HandTemplate, opts: Parameters<typeof placeHand>[1]): Pose {
  const lms = placeHand(tpl, opts);
  return classifyPose(toDisplayPoints(lms, opts.videoWidth ?? 640, opts.videoHeight ?? 480));
}

describe('classifyPose (rule-based)', () => {
  for (const [name, tpl, expected] of cases) {
    it(`${name} → ${expected} under rotation ±20°, scale 0.5–2×, and noise`, () => {
      const rand = rng(123);
      let n = 0;
      for (const rotationDeg of [-20, -10, 0, 10, 20]) {
        for (const k of [0.5, 1, 1.5, 2]) {
          for (let trial = 0; trial < 4; trial++) {
            const pose = classify(tpl, {
              center: { x: 0.3 + 0.4 * rand(), y: 0.35 + 0.3 * rand() },
              scale: 0.12 * k,
              rotationDeg,
              noise: 0.02,
              rand,
            });
            expect(pose, `rot ${rotationDeg}° scale ${k}× trial ${trial}`).toBe(expected);
            n++;
          }
        }
      }
      expect(n).toBe(80);
    });
  }

  it('classifies on a 16:9 frame as well', () => {
    for (const [, tpl, expected] of cases) {
      expect(
        classify(tpl, { center: { x: 0.5, y: 0.5 }, videoWidth: 1280, videoHeight: 720 }),
      ).toBe(expected);
    }
  });

  it('pinch and relaxed hands are "other"', () => {
    expect(classify(PINCH, { center: { x: 0.5, y: 0.5 } })).toBe('other');
    expect(classify(RELAXED, { center: { x: 0.5, y: 0.5 } })).toBe('other');
  });

  it('an upside-down thumbs up (thumb down) is not thumbs up', () => {
    expect(classify(THUMBS_UP, { center: { x: 0.5, y: 0.5 }, rotationDeg: 180 })).not.toBe(
      'thumbs_up',
    );
  });
});

describe('canned gesture override', () => {
  it('maps MediaPipe labels', () => {
    expect(cannedToPose('Open_Palm')).toBe('open_palm');
    expect(cannedToPose('Closed_Fist')).toBe('fist');
    expect(cannedToPose('Thumb_Up')).toBe('thumbs_up');
    for (const other of ['None', 'Pointing_Up', 'Thumb_Down', 'Victory', 'ILoveYou']) {
      expect(cannedToPose(other)).toBe('other');
    }
  });

  it('uses the canned gesture when its score ≥ threshold', () => {
    expect(resolvePose('open_palm', { name: 'Closed_Fist', score: 0.9 }, 0.6)).toEqual({
      pose: 'fist',
      source: 'canned',
    });
    expect(resolvePose('open_palm', { name: 'None', score: 0.8 }, 0.6).pose).toBe('other');
  });

  it('falls back to the rules when the score is low or the engine has no classifier', () => {
    expect(resolvePose('open_palm', { name: 'Closed_Fist', score: 0.4 }, 0.6)).toEqual({
      pose: 'open_palm',
      source: 'rules',
    });
    expect(resolvePose('thumbs_up', undefined, 0.6)).toEqual({
      pose: 'thumbs_up',
      source: 'rules',
    });
  });
});
