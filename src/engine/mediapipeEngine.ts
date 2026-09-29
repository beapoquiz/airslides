import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import { toHandFrame } from './mediapipeAdapter';
import type { HandFrame, LandmarkEngine } from './types';

export const REMOTE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

/** A real .task file is ~8 MB; anything tiny is an HTML fallback page or an error. */
const MIN_MODEL_BYTES = 1_000_000;

async function fetchModel(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model HTTP ${res.status} at ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < MIN_MODEL_BYTES) throw new Error(`model at ${url} is not a .task file`);
  return buf;
}

/**
 * MediaPipe Tasks Vision GestureRecognizer: 21 landmarks + handedness +
 * canned gestures. WASM is self-hosted under `${BASE_URL}mediapipe/wasm` so the
 * JS and WASM versions always match.
 */
export class MediaPipeEngine implements LandmarkEngine {
  readonly id = 'mediapipe';
  readonly label = 'MediaPipe GestureRecognizer';
  backend = '—';
  modelSource: 'local' | 'remote' | null = null;
  private recognizer: GestureRecognizer | null = null;

  async init(): Promise<void> {
    if (this.recognizer) return;
    const base = import.meta.env.BASE_URL;
    const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);

    let model: Uint8Array;
    try {
      model = await fetchModel(`${base}models/gesture_recognizer.task`);
      this.modelSource = 'local';
    } catch (err) {
      console.warn('[airslides] local model unavailable, using Google CDN:', err);
      model = await fetchModel(REMOTE_MODEL_URL);
      this.modelSource = 'remote';
    }

    let lastError: unknown = null;
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        this.recognizer = await GestureRecognizer.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: model.slice(), delegate },
          runningMode: 'VIDEO',
          numHands: 1,
        });
        this.backend = delegate;
        return;
      } catch (err) {
        lastError = err;
        console.warn(`[airslides] ${delegate} delegate failed:`, err);
      }
    }
    throw lastError ?? new Error('GestureRecognizer failed to initialise');
  }

  detect(video: HTMLVideoElement, tMs: number): HandFrame {
    if (!this.recognizer) throw new Error('engine not initialised');
    const result = this.recognizer.recognizeForVideo(video, tMs);
    return toHandFrame(result, tMs, video.videoWidth, video.videoHeight);
  }

  dispose(): void {
    this.recognizer?.close();
    this.recognizer = null;
  }
}
