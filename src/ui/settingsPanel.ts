import { ENGINES } from '../engine/registry';
import { settings, type BubbleSize } from '../settings';
import { h, ICONS, svg } from './dom';

/**
 * Settings dialog (gear icon): engine, swipe direction, hold duration,
 * skeleton, camera bubble size, laser active region. Everything persists via
 * the settings store (localStorage, if available).
 */
export function createSettingsPanel(): { dialog: HTMLDialogElement; open: () => void } {
  const engine = h('select', { id: 'set-engine' });
  for (const e of ENGINES) {
    engine.append(h('option', { value: e.id, disabled: !e.available }, e.label));
  }
  engine.addEventListener('change', () => settings.update({ engine: engine.value }));

  const invert = h('input', { type: 'checkbox', id: 'set-invert' });
  invert.addEventListener('change', () =>
    settings.update({ gesture: { invertSwipe: invert.checked } }),
  );

  const hold = h('input', { type: 'range', id: 'set-hold', min: 500, max: 2500, step: 100 });
  const holdOut = h('output', { for: 'set-hold', class: 'mono' });
  hold.addEventListener('input', () =>
    settings.update({ gesture: { holdDurationMs: Number(hold.value) } }),
  );

  const skeleton = h('input', { type: 'checkbox', id: 'set-skeleton' });
  skeleton.addEventListener('change', () => settings.update({ showSkeleton: skeleton.checked }));

  const size = h('select', { id: 'set-size' });
  for (const [v, label] of [
    ['small', 'Small'],
    ['medium', 'Medium'],
    ['large', 'Large'],
  ] as const) {
    size.append(h('option', { value: v }, label));
  }
  size.addEventListener('change', () => settings.update({ bubbleSize: size.value as BubbleSize }));

  const region = h('input', { type: 'range', id: 'set-region', min: 0.4, max: 1, step: 0.05 });
  const regionOut = h('output', { for: 'set-region', class: 'mono' });
  region.addEventListener('input', () =>
    settings.update({ gesture: { activeRegion: Number(region.value) } }),
  );

  const sync = () => {
    const s = settings.get();
    const g = settings.gestureConfig();
    engine.value = s.engine;
    invert.checked = g.invertSwipe;
    hold.value = String(g.holdDurationMs);
    holdOut.value = `${(g.holdDurationMs / 1000).toFixed(1)} s`;
    skeleton.checked = s.showSkeleton;
    size.value = s.bubbleSize;
    region.value = String(g.activeRegion);
    regionOut.value = `${Math.round(g.activeRegion * 100)} %`;
  };

  const dialog = h(
    'dialog',
    { class: 'sheet', 'aria-labelledby': 'settings-title', 'data-testid': 'settings' },
    h(
      'div',
      { class: 'sheet-head' },
      h('h2', { id: 'settings-title' }, 'Settings'),
      h(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          'aria-label': 'Close settings',
          onclick: () => dialog.close(),
        },
        svg(ICONS.close),
      ),
    ),
    h(
      'div',
      { class: 'sheet-body' },
      h(
        'label',
        { class: 'setting', for: 'set-engine' },
        h('span', {}, 'Hand-tracking engine'),
        engine,
        h('small', {}, 'The thesis model (BlazeHand-KD) is planned for phase 2.'),
      ),
      h(
        'label',
        { class: 'setting setting-inline', for: 'set-invert' },
        h('span', {}, 'Invert swipe direction'),
        invert,
      ),
      h('small', { class: 'muted' }, 'Off: moving your hand toward your left = next slide.'),
      h(
        'div',
        { class: 'setting' },
        h('label', { for: 'set-hold' }, h('span', {}, 'Hold duration '), holdOut),
        hold,
        h('small', {}, 'How long palm / thumbs-up / fist must be held.'),
      ),
      h(
        'label',
        { class: 'setting setting-inline', for: 'set-skeleton' },
        h('span', {}, 'Show hand skeleton'),
        skeleton,
      ),
      h('label', { class: 'setting', for: 'set-size' }, h('span', {}, 'Camera bubble size'), size),
      h(
        'div',
        { class: 'setting' },
        h('label', { for: 'set-region' }, h('span', {}, 'Laser reach area '), regionOut),
        region,
        h(
          'small',
          {},
          'Share of the camera view mapped to the whole slide. Smaller = less arm movement.',
        ),
      ),
      h(
        'a',
        { href: '#/playground', onclick: () => dialog.close() },
        'Fine-tune every threshold in the Playground →',
      ),
    ),
  );
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  settings.subscribe(sync);
  sync();

  return {
    dialog,
    open: () => {
      sync();
      if (!dialog.open) dialog.showModal();
    },
  };
}
