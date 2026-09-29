/**
 * Engine-agnostic hand-tracking types. Everything downstream of the engine
 * (geometry, detectors, controller, UI) consumes only these, so a second
 * landmark engine (e.g. the thesis BlazeHand-KD model, see docs/PHASE2.md) can
 * be swapped in without touching gesture logic.
 */

/** Normalized image coordinates in [0, 1], *un-mirrored* (as the camera sees it). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type Handedness = 'Left' | 'Right';

export interface HandObservation {
  /** Exactly 21 points in MediaPipe order (0 wrist, 4 thumb tip, 8 index tip, …). */
  landmarks: Landmark[];
  /** The presenter's actual hand. */
  handedness: Handedness;
  handednessScore: number;
  /** Present for MediaPipe; absent for engines without a gesture classifier. */
  cannedGesture?: { name: string; score: number };
}

export interface HandFrame {
  /** Monotonic timestamp in ms. */
  t: number;
  videoWidth: number;
  videoHeight: number;
  hands: HandObservation[];
}

export interface LandmarkEngine {
  readonly id: string;
  readonly label: string;
  /** Human-readable backend detail for the Playground, e.g. "GPU" or "CPU". */
  readonly backend: string;
  init(): Promise<void>;
  /**
   * Run inference on the current video frame. `tMs` must increase
   * monotonically. May return a Promise so asynchronous runtimes (e.g.
   * onnxruntime-web) fit the same interface; the frame loop never starts a new
   * inference while one is still pending.
   */
  detect(video: HTMLVideoElement, tMs: number): HandFrame | Promise<HandFrame>;
  dispose(): void;
}

/** MediaPipe hand landmark indices. */
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

/** Skeleton edges for drawing (same topology as MediaPipe's HAND_CONNECTIONS). */
export const HAND_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];
