import { h, svg } from './dom';
import {
  FIST_ICON,
  OPEN_PALM_ICON,
  PINCH_ICON,
  SWIPE_LEFT_ICON,
  SWIPE_RIGHT_ICON,
  THUMBS_UP_ICON,
} from './handIcons';
import { KEY_BINDINGS } from './shortcuts';
import { REPO_URL, THESIS_URL, topbar } from './topbar';
import type { View } from './view';

const GESTURES: [icon: string, gesture: string, action: string, tip: string][] = [
  [
    SWIPE_LEFT_ICON,
    'Swipe left, open hand',
    'Next slide',
    'A quick flick toward your left, like turning a page on a phone.',
  ],
  [
    SWIPE_RIGHT_ICON,
    'Swipe right, open hand',
    'Previous slide',
    'The swing back after a swipe is ignored for a second.',
  ],
  [
    PINCH_ICON,
    'Pinch (thumb + index)',
    'Laser pointer',
    'The dot follows your pinch; release to hide it.',
  ],
  [
    OPEN_PALM_ICON,
    'Open palm, held still ~1 s',
    'Blackout on / off',
    'Keep the palm still. After a swipe, lower your hand first.',
  ],
  [
    THUMBS_UP_ICON,
    'Thumbs up, held still ~1 s',
    'Start / pause timer',
    'The timer appears top-right.',
  ],
  [
    FIST_ICON,
    'Fist, held still ~1 s',
    'Lock / unlock gestures',
    'Lock while you talk with your hands.',
  ],
];

const TROUBLESHOOTING: [string, string][] = [
  [
    'The camera doesn’t start',
    'Allow camera access in the browser’s site settings, make sure the page is https:// (or localhost), and close other apps that use the camera (Zoom, Teams, Meet). Keyboard controls work without a camera.',
  ],
  [
    'Swipes don’t trigger',
    'Keep your hand open (fingers visible), flick a bit faster and further, and stay 0.5–1.5 m from the camera. The Playground shows your hand’s speed against the threshold.',
  ],
  [
    'Slides change while I talk with my hands',
    'Hold a fist for a second to lock gestures, and again to unlock. Lowering your hand between gestures also helps.',
  ],
  [
    'Blackout turns on by accident',
    'It needs an open palm held still for a second. After swiping, drop your hand before raising it again, or raise the hold duration in Settings.',
  ],
  [
    'The laser is shaky or hard to reach the edges',
    'Rest your elbow, and lower “Laser reach area” in Settings so smaller hand movements cover the whole slide.',
  ],
  [
    'It feels slow on my phone or tablet',
    'Close other tabs and apps, use good lighting, and check the FPS in the Playground. Hand tracking runs on your device’s GPU when available.',
  ],
];

export function createHelpView(): View {
  const gestureRows = GESTURES.map(([icon, gesture, action, tip]) =>
    h(
      'tr',
      {},
      h('td', {}, h('span', { class: 'gesture-icon' }, svg(icon))),
      h('th', { scope: 'row' }, gesture),
      h('td', {}, h('strong', {}, action)),
      h('td', { class: 'muted' }, tip),
    ),
  );
  const keyRows = KEY_BINDINGS.map((b) =>
    h(
      'tr',
      {},
      h('td', {}, ...b.keys.flatMap((k, i) => [i ? ' ' : '', h('kbd', {}, k)])),
      h('td', {}, b.label),
    ),
  );

  const el = h(
    'div',
    { class: 'page' },
    topbar('help'),
    h(
      'main',
      { class: 'help', id: 'main' },
      h('h1', {}, 'How to use AirSlides'),
      h(
        'p',
        { class: 'muted' },
        'Open the tutorial or a PDF, allow the camera, and present with one hand. A camera bubble in the corner shows what the tracker sees. Every gesture also has a keyboard shortcut.',
      ),
      h(
        'section',
        { 'aria-labelledby': 'h-gestures' },
        h('h2', { id: 'h-gestures' }, 'Gestures'),
        h(
          'table',
          { class: 'gesture-table' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', {}, h('span', { class: 'visually-hidden' }, 'Icon')),
              h('th', {}, 'Gesture'),
              h('th', {}, 'Action'),
              h('th', {}, 'Tip'),
            ),
          ),
          h('tbody', {}, ...gestureRows),
        ),
        h(
          'p',
          { class: 'muted' },
          '“Left” and “right” are from your point of view, as in the mirrored preview. You can invert the direction in Settings.',
        ),
      ),
      h(
        'section',
        { 'aria-labelledby': 'h-keys' },
        h('h2', { id: 'h-keys' }, 'Keyboard shortcuts'),
        h('table', { class: 'key-table' }, h('tbody', {}, ...keyRows)),
        h(
          'p',
          { class: 'muted' },
          'On touch screens, tap the right side of a slide for next and the left side for previous.',
        ),
      ),
      h(
        'section',
        { 'aria-labelledby': 'h-trouble' },
        h('h2', { id: 'h-trouble' }, 'Troubleshooting'),
        ...TROUBLESHOOTING.map(([q, a]) => h('details', {}, h('summary', {}, q), h('p', {}, a))),
      ),
      h(
        'section',
        { 'aria-labelledby': 'h-privacy' },
        h('h2', { id: 'h-privacy' }, 'Privacy'),
        h(
          'p',
          {},
          'Everything runs on your device. Camera frames are processed in your browser by MediaPipe and are never uploaded or stored. PDFs are opened in memory and never leave your device. There are no accounts, analytics or cookies; your settings are saved only in this browser’s local storage.',
        ),
      ),
      h(
        'section',
        { 'aria-labelledby': 'h-about' },
        h('h2', { id: 'h-about' }, 'About'),
        h(
          'p',
          {},
          'AirSlides is open source (MIT) by Bea Juliana Poquiz. Hand tracking: ',
          h(
            'a',
            {
              href: 'https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer',
              target: '_blank',
              rel: 'noopener',
            },
            'MediaPipe Gesture Recognizer',
          ),
          ' · PDF rendering: ',
          h(
            'a',
            { href: 'https://mozilla.github.io/pdf.js/', target: '_blank', rel: 'noopener' },
            'pdf.js',
          ),
          ' (both Apache-2.0).',
        ),
        h(
          'p',
          {},
          h('a', { href: REPO_URL, target: '_blank', rel: 'noopener' }, 'Source code on GitHub'),
          ' · Related: ',
          h(
            'a',
            { href: THESIS_URL, target: '_blank', rel: 'noopener' },
            'my thesis on real-time 2D hand pose estimation via heterogeneous knowledge distillation',
          ),
        ),
      ),
    ),
  );
  return { el, unmount() {} };
}
