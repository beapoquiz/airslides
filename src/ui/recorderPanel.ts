import {
  downloadJson,
  FrameRecorder,
  RECORD_LABELS,
  recordingFilename,
  type RecordLabel,
} from '../recorder/recorder';
import type { GestureRuntime } from '../runtime';
import { h } from './dom';

const COUNTDOWN_S = 3;

/**
 * Playground panel: record HandFrame sequences for a labelled gesture and
 * download them as JSON fixtures (see tests/fixtures/recorded/README.md).
 */
export function recorderPanel(rt: GestureRuntime): { el: HTMLElement; dispose: () => void } {
  const label = h('select', { id: 'rec-label' });
  for (const l of RECORD_LABELS) label.append(h('option', { value: l }, l));
  const seconds = h('input', {
    type: 'number',
    id: 'rec-seconds',
    min: 1,
    max: 30,
    step: 1,
    value: 4,
  });
  const button = h('button', { class: 'btn btn-primary', type: 'button' }, '● Record');
  const status = h('p', { class: 'rec-status', role: 'status', 'aria-live': 'polite' }, 'Idle');

  let recorder: FrameRecorder | null = null;
  let offFrame: (() => void) | null = null;
  let timers: number[] = [];

  const reset = () => {
    offFrame?.();
    offFrame = null;
    recorder = null;
    timers.forEach((t) => window.clearTimeout(t));
    timers = [];
    button.textContent = '● Record';
    status.classList.remove('recording');
  };

  const begin = () => {
    const lbl = label.value as RecordLabel;
    const ms = Math.min(30, Math.max(1, Number(seconds.value) || 4)) * 1000;
    const rec = new FrameRecorder(lbl, ms, rt.engineLabel);
    recorder = rec;
    status.classList.add('recording');
    offFrame = rt.onFrame((f) => {
      rec.push(f);
      status.textContent = `● Recording ${lbl}: ${(rec.elapsedMs / 1000).toFixed(1)} s · ${rec.frameCount} frames`;
    });
    void rec.done.then((recording) => {
      const name = recordingFilename(lbl, new Date());
      downloadJson(recording, name);
      status.textContent = `Saved ${name} (${recording.frames.length} frames). Move it into tests/fixtures/recorded/.`;
      reset();
    });
  };

  button.addEventListener('click', () => {
    if (recorder || timers.length) {
      // second click: stop early (keeps what was recorded) or cancel the countdown
      if (recorder) recorder.finish();
      else {
        reset();
        status.textContent = 'Cancelled';
      }
      return;
    }
    if (!rt.active) {
      status.textContent = 'Start the camera first.';
      void rt.start();
      return;
    }
    button.textContent = '■ Stop';
    for (let i = COUNTDOWN_S; i > 0; i--) {
      timers.push(
        window.setTimeout(() => (status.textContent = `Get ready… ${i}`), (COUNTDOWN_S - i) * 1000),
      );
    }
    timers.push(
      window.setTimeout(() => {
        timers = [];
        begin();
      }, COUNTDOWN_S * 1000),
    );
  });

  const el = h(
    'section',
    { class: 'pg-recorder card', 'aria-label': 'Recorder' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Record a test fixture')),
    h(
      'p',
      { class: 'muted' },
      'Records the landmark stream (no video) for a few seconds and downloads it as JSON. Replayed by the unit tests to check real-world behaviour.',
    ),
    h(
      'div',
      { class: 'recorder-controls' },
      h('label', { class: 'field', for: 'rec-label' }, 'Gesture', label),
      h('label', { class: 'field', for: 'rec-seconds' }, 'Seconds', seconds),
      button,
    ),
    status,
  );
  return { el, dispose: reset };
}
