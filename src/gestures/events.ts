export type ControllerState = 'NO_HAND' | 'LOCKED' | 'ACTIVE' | 'PINCHING' | 'BLACKOUT';

export type HoldPose = 'open_palm' | 'thumbs_up' | 'fist';

/** Every event the GestureController emits, with its payload. */
export interface GestureEventMap {
  next: Record<string, never>;
  prev: Record<string, never>;
  /** Laser position in slide space, both axes in [0, 1]. */
  laserMove: { x: number; y: number };
  laserEnd: Record<string, never>;
  toggleBlackout: { active: boolean };
  toggleTimer: Record<string, never>;
  toggleLock: { locked: boolean };
  /** The hold closest to firing (pose null + progress 0 when none). */
  holdProgress: { pose: HoldPose | null; progress: number };
  stateChange: { state: ControllerState; previous: ControllerState };
}

export type GestureEventType = keyof GestureEventMap;

export type Listener<K extends GestureEventType> = (payload: GestureEventMap[K]) => void;
export type AnyListener = <K extends GestureEventType>(
  type: K,
  payload: GestureEventMap[K],
) => void;

/** Minimal typed event emitter. `on` returns an unsubscribe function. */
export class GestureEmitter {
  private listeners = new Map<GestureEventType, Set<(p: unknown) => void>>();
  private anyListeners = new Set<AnyListener>();

  on<K extends GestureEventType>(type: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    const wrapped = fn as (p: unknown) => void;
    set.add(wrapped);
    return () => set.delete(wrapped);
  }

  onAny(fn: AnyListener): () => void {
    this.anyListeners.add(fn);
    return () => this.anyListeners.delete(fn);
  }

  emit<K extends GestureEventType>(type: K, payload: GestureEventMap[K]): void {
    for (const fn of this.listeners.get(type) ?? []) fn(payload);
    for (const fn of this.anyListeners) fn(type, payload);
  }
}
