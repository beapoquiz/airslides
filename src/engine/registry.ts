import type { LandmarkEngine } from './types';

export interface EngineInfo {
  id: string;
  label: string;
  available: boolean;
  note?: string;
  /** Lazily imported so the engine's runtime (WASM, model) loads only when used. */
  create?: () => Promise<LandmarkEngine>;
}

export const ENGINES: readonly EngineInfo[] = [
  {
    id: 'mediapipe',
    label: 'MediaPipe GestureRecognizer',
    available: true,
    create: async () => new (await import('./mediapipeEngine')).MediaPipeEngine(),
  },
  {
    id: 'blazehand-kd',
    label: 'BlazeHand-KD (my thesis model) — coming soon',
    available: false,
    note: 'Phase 2: see docs/PHASE2.md',
  },
];

export function engineInfo(id: string): EngineInfo {
  return ENGINES.find((e) => e.id === id && e.available) ?? (ENGINES[0] as EngineInfo);
}
