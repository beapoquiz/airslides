import { CAMERA_MESSAGES } from '../camera/camera';
import type { GestureRuntime } from '../runtime';
import { h } from './dom';

/** Human-readable one-liner for the runtime state. */
export function statusText(rt: GestureRuntime): string {
  switch (rt.status) {
    case 'idle':
      return 'Camera off';
    case 'starting-camera':
      return 'Waiting for camera permission…';
    case 'loading-model':
      return 'Loading hand-tracking model…';
    case 'running':
      return `Camera on · ${rt.engineLabel}`;
    case 'camera-error':
      return CAMERA_MESSAGES[rt.cameraError ?? 'unknown'].title;
    case 'engine-error':
      return 'Hand tracking failed to load';
  }
}

/**
 * Status chip + (when relevant) an explanatory message and an action button.
 * Re-renders itself on runtime status changes; call the returned dispose().
 */
export function cameraStatusPanel(rt: GestureRuntime): { el: HTMLElement; dispose: () => void } {
  const el = h('div', { class: 'camera-status', role: 'status', 'aria-live': 'polite' });

  const render = () => {
    el.replaceChildren();
    el.dataset.status = rt.status;
    el.append(
      h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'status-text' }, statusText(rt)),
    );
    if (rt.status === 'idle') {
      el.append(
        h(
          'button',
          { class: 'btn btn-small', type: 'button', onclick: () => void rt.start() },
          'Enable camera',
        ),
      );
    } else if (rt.status === 'camera-error') {
      const msg = CAMERA_MESSAGES[rt.cameraError ?? 'unknown'];
      el.append(
        h('p', { class: 'status-detail' }, msg.body),
        h(
          'button',
          { class: 'btn btn-small', type: 'button', onclick: () => void rt.start() },
          'Try again',
        ),
      );
    } else if (rt.status === 'engine-error') {
      el.append(
        h(
          'p',
          { class: 'status-detail' },
          `The hand-tracking model couldn’t start (${rt.engineError ?? 'unknown error'}). Keyboard controls still work.`,
        ),
        h(
          'button',
          { class: 'btn btn-small', type: 'button', onclick: () => void rt.start() },
          'Retry',
        ),
      );
    }
  };
  render();
  const off = rt.onStatus(render);
  return { el, dispose: off };
}
