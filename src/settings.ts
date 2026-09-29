import { resolveConfig, type GestureConfig } from './config';

export type BubbleSize = 'small' | 'medium' | 'large';

export interface Settings {
  /** Landmark engine id (see engine/registry.ts). */
  engine: string;
  showSkeleton: boolean;
  /** Camera bubble visible in Present view (toggled with C). */
  bubbleVisible: boolean;
  bubbleSize: BubbleSize;
  /** Playground: draw landmark index numbers. */
  showLandmarkIds: boolean;
  /** Overrides on top of DEFAULT_CONFIG (thresholds, invertSwipe, hold duration, active region). */
  gesture: Partial<GestureConfig>;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  engine: 'mediapipe',
  showSkeleton: true,
  bubbleVisible: true,
  bubbleSize: 'medium',
  showLandmarkIds: false,
  gesture: {},
});

const KEY = 'airslides.settings.v1';

/** Read settings; any storage failure (private mode, blocked cookies) → defaults. */
export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS) as Settings;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return sanitize(parsed);
  } catch {
    return structuredClone(DEFAULT_SETTINGS) as Settings;
  }
}

function sanitize(p: Partial<Settings>): Settings {
  const d = DEFAULT_SETTINGS;
  const sizes: BubbleSize[] = ['small', 'medium', 'large'];
  return {
    engine: typeof p.engine === 'string' ? p.engine : d.engine,
    showSkeleton: typeof p.showSkeleton === 'boolean' ? p.showSkeleton : d.showSkeleton,
    bubbleVisible: typeof p.bubbleVisible === 'boolean' ? p.bubbleVisible : d.bubbleVisible,
    bubbleSize: sizes.includes(p.bubbleSize as BubbleSize)
      ? (p.bubbleSize as BubbleSize)
      : d.bubbleSize,
    showLandmarkIds: typeof p.showLandmarkIds === 'boolean' ? p.showLandmarkIds : d.showLandmarkIds,
    gesture:
      p.gesture && typeof p.gesture === 'object' ? onlyChanged(resolveConfig(p.gesture)) : {},
  };
}

/** Keep only values that differ from the defaults, so future default changes still apply. */
function onlyChanged(cfg: GestureConfig): Partial<GestureConfig> {
  const defaults = resolveConfig();
  const out: Partial<GestureConfig> = {};
  for (const k of Object.keys(cfg) as (keyof GestureConfig)[]) {
    if (cfg[k] !== defaults[k]) (out as Record<string, unknown>)[k] = cfg[k];
  }
  return out;
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}

type SettingsListener = (s: Readonly<Settings>) => void;

/** App-wide settings with change notifications. */
class SettingsStore {
  private value: Settings = loadSettings();
  private listeners = new Set<SettingsListener>();

  get(): Readonly<Settings> {
    return this.value;
  }

  gestureConfig(): GestureConfig {
    return resolveConfig(this.value.gesture);
  }

  update(patch: Partial<Omit<Settings, 'gesture'>> & { gesture?: Partial<GestureConfig> }): void {
    const gesture = patch.gesture
      ? onlyChanged(resolveConfig({ ...this.value.gesture, ...patch.gesture }))
      : this.value.gesture;
    this.value = { ...this.value, ...patch, gesture };
    saveSettings(this.value);
    for (const fn of this.listeners) fn(this.value);
  }

  resetGesture(): void {
    this.value = { ...this.value, gesture: {} };
    saveSettings(this.value);
    for (const fn of this.listeners) fn(this.value);
  }

  subscribe(fn: SettingsListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const settings = new SettingsStore();
