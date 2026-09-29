import { describe, expect, it } from 'vitest';
import {
  FrameRecorder,
  labelFromFilename,
  parseRecording,
  recordingFilename,
} from '../src/recorder/recorder';
import type { HandFrame } from '../src/engine/types';

const frame = (t: number): HandFrame => ({ t, videoWidth: 640, videoHeight: 480, hands: [] });

describe('recorder', () => {
  it('names files label_YYYYMMDD-HHMMSS.json', () => {
    expect(recordingFilename('swipe_left', new Date(2026, 8, 29, 7, 5, 3))).toBe(
      'swipe_left_20260929-070503.json',
    );
  });

  it('recovers the label from a filename (including multi-word labels)', () => {
    expect(labelFromFilename('swipe_left_20260929-070503.json')).toBe('swipe_left');
    expect(labelFromFilename('open_palm_hold_20260929-070503.json')).toBe('open_palm_hold');
    expect(labelFromFilename('tests/fixtures/recorded/idle_talking_20260101-000000.json')).toBe(
      'idle_talking',
    );
    expect(labelFromFilename('wave_20260929-070503.json')).toBeNull();
    expect(labelFromFilename('notes.json')).toBeNull();
  });

  it('parses both the wrapped format and a bare frame array', () => {
    const frames = [frame(1), frame(2)];
    expect(parseRecording({ version: 1, label: 'pinch', frames }, 'x.json')).toEqual({
      label: 'pinch',
      frames,
    });
    expect(parseRecording(frames, 'fist_hold_20260929-070503.json')).toEqual({
      label: 'fist_hold',
      frames,
    });
  });

  it('records for the requested duration and resolves once', async () => {
    const rec = new FrameRecorder('pinch', 100, 'test');
    for (let t = 1000; t <= 1200; t += 33) rec.push(frame(t));
    const r = await rec.done;
    expect(r.label).toBe('pinch');
    expect(r.frames[0]!.t).toBe(1000);
    expect(r.frames.at(-1)!.t).toBeGreaterThanOrEqual(1100);
    expect(r.frames.length).toBe(5); // stops at the first frame past 100 ms
    expect(r.version).toBe(1);
  });
});
