import { describe, expect, it } from 'vitest';
import { toHandFrame } from '../src/engine/mediapipeAdapter';

const lms = Array.from({ length: 21 }, (_, i) => ({ x: i / 40, y: 0.5, z: 0, visibility: 1 }));
const cat = (categoryName: string, score: number) => ({
  categoryName,
  score,
  index: -1,
  displayName: '',
});

describe('toHandFrame (MediaPipe → HandFrame)', () => {
  it('copies landmarks and swaps handedness for the un-mirrored input', () => {
    const f = toHandFrame(
      { landmarks: [lms], handedness: [[cat('Left', 0.97)]], gestures: [[cat('Open_Palm', 0.8)]] },
      123,
      640,
      480,
    );
    expect(f).toMatchObject({ t: 123, videoWidth: 640, videoHeight: 480 });
    expect(f.hands).toHaveLength(1);
    const hand = f.hands[0]!;
    expect(hand.handedness).toBe('Right');
    expect(hand.handednessScore).toBe(0.97);
    expect(hand.landmarks).toHaveLength(21);
    expect(hand.landmarks[3]).toEqual({ x: 3 / 40, y: 0.5, z: 0 }); // no `visibility`
    expect(hand.cannedGesture).toEqual({ name: 'Open_Palm', score: 0.8 });
  });

  it('returns no hands for an empty result and skips malformed hands', () => {
    expect(toHandFrame({ landmarks: [], handedness: [], gestures: [] }, 1, 640, 480).hands).toEqual(
      [],
    );
    const f = toHandFrame(
      { landmarks: [lms.slice(0, 5)], handedness: [], gestures: [] },
      1,
      640,
      480,
    );
    expect(f.hands).toEqual([]);
  });

  it('omits cannedGesture when the engine gives none', () => {
    const f = toHandFrame(
      { landmarks: [lms], handedness: [[cat('Right', 0.9)]], gestures: [] },
      1,
      640,
      480,
    );
    expect(f.hands[0]!.handedness).toBe('Left');
    expect(f.hands[0]!.cannedGesture).toBeUndefined();
  });
});
