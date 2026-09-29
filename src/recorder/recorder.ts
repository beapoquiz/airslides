import type { HandFrame } from '../engine/types';

/** What a recording demonstrates; the fixture-replay test derives expectations from it. */
export const RECORD_LABELS = [
  'swipe_left',
  'swipe_right',
  'pinch',
  'open_palm_hold',
  'thumbs_up_hold',
  'fist_hold',
  'idle_talking',
  'hand_enter_exit',
] as const;

export type RecordLabel = (typeof RECORD_LABELS)[number];

export interface Recording {
  version: 1;
  label: RecordLabel;
  engine: string;
  recordedAt: string;
  durationMs: number;
  frames: HandFrame[];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `swipe_left_20260929-143005.json` (local time). */
export function recordingFilename(label: RecordLabel, date: Date): string {
  const d = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${label}_${d}-${t}.json`;
}

/** Label from a recording's filename, or null if it isn't one we know. */
export function labelFromFilename(name: string): RecordLabel | null {
  const m = /^([a-z_]+?)_\d{8}-\d{6}/.exec(name.split(/[\\/]/).pop() ?? '');
  const label = m?.[1];
  return label && (RECORD_LABELS as readonly string[]).includes(label)
    ? (label as RecordLabel)
    : null;
}

/** Accept both the wrapped format and a bare HandFrame[] array. */
export function parseRecording(
  json: unknown,
  filename = '',
): { label: RecordLabel | null; frames: HandFrame[] } {
  if (Array.isArray(json))
    return { label: labelFromFilename(filename), frames: json as HandFrame[] };
  const obj = json as Partial<Recording>;
  const label =
    obj.label && (RECORD_LABELS as readonly string[]).includes(obj.label)
      ? obj.label
      : labelFromFilename(filename);
  return { label, frames: Array.isArray(obj.frames) ? obj.frames : [] };
}

/**
 * Collects HandFrames for a fixed duration. Feed it every frame; it resolves
 * with the recording when the time is up.
 */
export class FrameRecorder {
  private frames: HandFrame[] = [];
  private startT: number | null = null;
  private resolve: ((r: Recording) => void) | null = null;

  constructor(
    private readonly label: RecordLabel,
    private readonly durationMs: number,
    private readonly engine: string,
  ) {}

  readonly done = new Promise<Recording>((res) => (this.resolve = res));

  get elapsedMs(): number {
    const last = this.frames[this.frames.length - 1];
    return this.startT === null || !last ? 0 : last.t - this.startT;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  push(frame: HandFrame): void {
    if (!this.resolve) return;
    if (this.startT === null) this.startT = frame.t;
    this.frames.push(structuredClone(frame));
    if (frame.t - this.startT >= this.durationMs) this.finish();
  }

  finish(): void {
    if (!this.resolve) return;
    const resolve = this.resolve;
    this.resolve = null;
    resolve({
      version: 1,
      label: this.label,
      engine: this.engine,
      recordedAt: new Date().toISOString(),
      durationMs: this.elapsedMs,
      frames: this.frames,
    });
  }
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
