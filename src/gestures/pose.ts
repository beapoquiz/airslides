import { DEFAULT_CONFIG, type GestureConfig } from '../config';
import type { HandObservation } from '../engine/types';
import { countExtendedFingers, thumbExtended, thumbRise, type Vec2 } from './geometry';

export type Pose = 'open_palm' | 'fist' | 'thumbs_up' | 'other';

export type PoseConfig = Pick<
  GestureConfig,
  'fingerExtendedRatio' | 'thumbExtendedRatio' | 'thumbMinSpread' | 'thumbsUpMinRise'
>;

export interface PoseFeatures {
  /** Extended count among index / middle / ring / pinky. */
  fingers: number;
  thumbExtended: boolean;
  /** Thumb tip height above thumb MCP, palm sizes. */
  thumbRise: number;
}

export function poseFeatures(
  points: readonly Vec2[],
  cfg: PoseConfig = DEFAULT_CONFIG,
): PoseFeatures {
  return {
    fingers: countExtendedFingers(points, cfg.fingerExtendedRatio),
    thumbExtended: thumbExtended(points, cfg.thumbExtendedRatio, cfg.thumbMinSpread),
    thumbRise: thumbRise(points),
  };
}

export function classifyFeatures(f: PoseFeatures, cfg: PoseConfig = DEFAULT_CONFIG): Pose {
  const thumbUp = f.thumbRise > cfg.thumbsUpMinRise;
  if (f.fingers === 4 && f.thumbExtended) return 'open_palm';
  if (f.fingers === 0 && f.thumbExtended && thumbUp) return 'thumbs_up';
  if (f.fingers === 0 && !thumbUp) return 'fist';
  return 'other';
}

/**
 * Rule-based pose from landmarks alone (display-space points, see
 * `toDisplayPoints`). Works for any engine, including ones without a gesture
 * classifier.
 */
export function classifyPose(points: readonly Vec2[], cfg: PoseConfig = DEFAULT_CONFIG): Pose {
  return classifyFeatures(poseFeatures(points, cfg), cfg);
}

/** MediaPipe canned gesture label → our pose vocabulary. */
export function cannedToPose(name: string): Pose {
  switch (name) {
    case 'Open_Palm':
      return 'open_palm';
    case 'Closed_Fist':
      return 'fist';
    case 'Thumb_Up':
      return 'thumbs_up';
    default:
      return 'other';
  }
}

export interface ResolvedPose {
  pose: Pose;
  source: 'canned' | 'rules';
}

/**
 * Final pose for a frame: trust the engine's canned gesture when it is
 * confident, otherwise fall back to the rules.
 */
export function resolvePose(
  rulePose: Pose,
  canned: HandObservation['cannedGesture'],
  minScore: number,
): ResolvedPose {
  if (canned && canned.score >= minScore)
    return { pose: cannedToPose(canned.name), source: 'canned' };
  return { pose: rulePose, source: 'rules' };
}
