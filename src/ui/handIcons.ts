/**
 * Simple hand illustrations drawn for this project (no third-party assets).
 * Each is a set of rounded shapes: filled lightly, outlined in currentColor.
 */
const wrap = (body: string, label: string) =>
  `<svg class="hand-icon" viewBox="0 0 64 64" role="img" aria-label="${label}"><g fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;

const PALM_BODY = `
  <rect x="5" y="33" width="18" height="7" rx="3.5" transform="rotate(-38 14 36.5)"/>
  <rect x="18" y="11" width="6.5" height="24" rx="3.25"/>
  <rect x="26" y="7" width="6.5" height="27" rx="3.25"/>
  <rect x="34" y="9" width="6.5" height="25" rx="3.25"/>
  <rect x="41.5" y="15" width="6" height="20" rx="3"/>
  <rect x="17" y="29" width="31" height="26" rx="10"/>`;

export const OPEN_PALM_ICON = wrap(PALM_BODY, 'Open palm');

export const FIST_ICON = wrap(
  `
  <rect x="15" y="24" width="34" height="31" rx="10"/>
  <rect x="17" y="20" width="7.5" height="16" rx="3.75"/>
  <rect x="25" y="18" width="7.5" height="17" rx="3.75"/>
  <rect x="33" y="19" width="7.5" height="16" rx="3.75"/>
  <rect x="41" y="22" width="7" height="14" rx="3.5"/>
  <rect x="12" y="37" width="25" height="7.5" rx="3.75"/>`,
  'Fist',
);

export const THUMBS_UP_ICON = wrap(
  `
  <rect x="9" y="33" width="13" height="21" rx="3"/>
  <rect x="21" y="29" width="28" height="26" rx="9"/>
  <rect x="33" y="29" width="19" height="6.5" rx="3.25"/>
  <rect x="33" y="35.5" width="20" height="6.5" rx="3.25"/>
  <rect x="33" y="42" width="19" height="6.5" rx="3.25"/>
  <rect x="33" y="48.5" width="16" height="6" rx="3"/>
  <rect x="22" y="6" width="8.5" height="29" rx="4.25"/>`,
  'Thumbs up',
);

export const PINCH_ICON = `<svg class="hand-icon" viewBox="0 0 64 64" role="img" aria-label="Pinch"><g fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
  <rect x="30" y="10" width="6.5" height="24" rx="3.25"/>
  <rect x="37.5" y="12" width="6.5" height="22" rx="3.25"/>
  <rect x="44.5" y="18" width="6" height="17" rx="3"/>
  <rect x="24" y="29" width="27" height="26" rx="10"/>
  <circle cx="19" cy="27" r="9" fill-opacity="0"/>
  <path d="M26 33 L20 36" fill="none"/>
  </g><circle cx="12.5" cy="20.5" r="3.2" fill="#ff2d55"/></svg>`;

function swipe(dir: 'left' | 'right'): string {
  const arrow =
    dir === 'left'
      ? '<path d="M48 60H12m0 0l6-5m-6 5l6 5" fill="none"/>'
      : '<path d="M16 60h36m0 0l-6-5m6 5l-6 5" fill="none"/>';
  return `<svg class="hand-icon" viewBox="0 0 64 70" role="img" aria-label="Swipe ${dir}"><g fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"><g transform="translate(5 -2) scale(0.85)">${PALM_BODY}</g>${arrow}</g></svg>`;
}

export const SWIPE_LEFT_ICON = swipe('left');
export const SWIPE_RIGHT_ICON = swipe('right');
