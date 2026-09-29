import { h, ICONS, svg } from './dom';

export type PresentAction =
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'blackout'
  | 'timer'
  | 'timerReset'
  | 'lock'
  | 'fullscreen'
  | 'bubble'
  | 'help';

/** Keyboard fallback for every action (presentation clickers send PageUp/PageDown). */
export const KEY_BINDINGS: { keys: string[]; action: PresentAction; label: string }[] = [
  { keys: ['→', 'PageDown', 'Space'], action: 'next', label: 'Next slide' },
  { keys: ['←', 'PageUp'], action: 'prev', label: 'Previous slide' },
  { keys: ['Home', 'End'], action: 'first', label: 'First / last slide' },
  { keys: ['B'], action: 'blackout', label: 'Blackout on / off' },
  { keys: ['T'], action: 'timer', label: 'Start / pause timer' },
  { keys: ['R'], action: 'timerReset', label: 'Reset timer' },
  { keys: ['L'], action: 'lock', label: 'Lock / unlock gestures' },
  { keys: ['F'], action: 'fullscreen', label: 'Fullscreen' },
  { keys: ['C'], action: 'bubble', label: 'Show / hide camera bubble' },
  { keys: ['?'], action: 'help', label: 'This help' },
];

export function actionForKey(e: KeyboardEvent): PresentAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
      return e.shiftKey && e.key === ' ' ? 'prev' : 'next';
    case 'ArrowLeft':
    case 'PageUp':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case '?':
      return 'help';
  }
  switch (e.key.toLowerCase()) {
    case 'b':
      return 'blackout';
    case 't':
      return 'timer';
    case 'r':
      return 'timerReset';
    case 'l':
      return 'lock';
    case 'f':
      return 'fullscreen';
    case 'c':
      return 'bubble';
  }
  return null;
}

/** True when a key press belongs to a form control rather than the presentation. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

export function shortcutsDialog(): HTMLDialogElement {
  const list = h('dl', { class: 'shortcut-list' });
  for (const b of KEY_BINDINGS) {
    list.append(
      h('dt', {}, ...b.keys.flatMap((k, i) => [i ? ' ' : '', h('kbd', {}, k)])),
      h('dd', {}, b.label),
    );
  }
  const dialog = h(
    'dialog',
    { class: 'sheet', 'aria-labelledby': 'shortcuts-title' },
    h(
      'div',
      { class: 'sheet-head' },
      h('h2', { id: 'shortcuts-title' }, 'Keyboard shortcuts'),
      h(
        'button',
        { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() },
        svg(ICONS.close),
      ),
    ),
    h(
      'div',
      { class: 'sheet-body' },
      list,
      h(
        'p',
        { class: 'muted' },
        'On a touch screen, tap the right side of a slide for next and the left side for previous.',
      ),
      h('a', { href: '#/help' }, 'Gestures, troubleshooting and privacy →'),
    ),
  );
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close(); // backdrop click
  });
  return dialog;
}
