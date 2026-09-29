import type { GestureRecognizerResult } from '@mediapipe/tasks-vision';
import type { HandFrame, HandObservation, Handedness } from './types';

/**
 * Convert a MediaPipe GestureRecognizer result into the engine-agnostic
 * HandFrame. Kept separate from the engine (type-only import) so it can be
 * unit-tested without loading WASM.
 *
 * Handedness: MediaPipe assumes a mirrored (selfie) input image. We feed the
 * raw, un-mirrored camera frame, so its label is swapped to report the
 * presenter's actual hand.
 */
export function toHandFrame(
  result: Pick<GestureRecognizerResult, 'landmarks' | 'handedness' | 'gestures'>,
  t: number,
  videoWidth: number,
  videoHeight: number,
): HandFrame {
  const hands: HandObservation[] = [];
  result.landmarks.forEach((lms, i) => {
    if (lms.length < 21) return;
    const hd = result.handedness[i]?.[0];
    const label: Handedness = hd?.categoryName === 'Left' ? 'Right' : 'Left';
    const obs: HandObservation = {
      landmarks: lms.map((l) => ({ x: l.x, y: l.y, z: l.z })),
      handedness: label,
      handednessScore: hd?.score ?? 0,
    };
    const g = result.gestures[i]?.[0];
    if (g) obs.cannedGesture = { name: g.categoryName || 'None', score: g.score };
    hands.push(obs);
  });
  return { t, videoWidth, videoHeight, hands };
}
