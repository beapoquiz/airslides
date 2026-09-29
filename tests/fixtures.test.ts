/**
 * Replays real recordings from the Playground (tests/fixtures/recorded/*.json)
 * through the GestureController and checks the events expected for each
 * label. Skips cleanly while the folder has no recordings.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRecording, type RecordLabel } from '../src/recorder/recorder';
import { run } from './helpers/run';

const DIR = fileURLToPath(new URL('./fixtures/recorded/', import.meta.url));
const files = existsSync(DIR)
  ? readdirSync(DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
  : [];

type Counts = (type: Parameters<ReturnType<typeof run>['count']>[0]) => number;

/** What each kind of recording must (and must not) produce. */
const EXPECTATIONS: Record<RecordLabel, (n: Counts) => void> = {
  swipe_left: (n) => {
    expect(n('next'), 'exactly one "next"').toBe(1);
    expect(n('prev'), 'no "prev"').toBe(0);
  },
  swipe_right: (n) => {
    expect(n('prev'), 'exactly one "prev"').toBe(1);
    expect(n('next'), 'no "next"').toBe(0);
  },
  pinch: (n) => {
    expect(n('laserMove'), 'laser moves').toBeGreaterThan(0);
    expect(n('next') + n('prev'), 'no navigation').toBe(0);
  },
  open_palm_hold: (n) => {
    expect(n('toggleBlackout'), 'exactly one blackout toggle').toBe(1);
    expect(n('next') + n('prev'), 'no navigation').toBe(0);
  },
  thumbs_up_hold: (n) => {
    expect(n('toggleTimer'), 'exactly one timer toggle').toBe(1);
    expect(n('next') + n('prev'), 'no navigation').toBe(0);
  },
  fist_hold: (n) => {
    expect(n('toggleLock'), 'exactly one lock toggle').toBe(1);
    expect(n('next') + n('prev'), 'no navigation').toBe(0);
  },
  idle_talking: (n) => {
    expect(n('next') + n('prev'), 'no navigation while talking').toBe(0);
  },
  hand_enter_exit: (n) => {
    expect(n('next') + n('prev'), 'no navigation when the hand enters / leaves').toBe(0);
  },
};

describe('recorded fixtures', () => {
  if (files.length === 0) {
    it.skip('no recordings in tests/fixtures/recorded/ yet — see its README', () => {});
    return;
  }
  for (const file of files) {
    it(file, () => {
      const { label, frames } = parseRecording(
        JSON.parse(readFileSync(join(DIR, file), 'utf8')),
        file,
      );
      expect(label, `unknown label for ${file}`).not.toBeNull();
      expect(frames.length, 'recording has frames').toBeGreaterThan(0);
      const { count } = run(frames);
      EXPECTATIONS[label as RecordLabel](count);
    });
  }
});
