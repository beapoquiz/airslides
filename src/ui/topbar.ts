import { h, ICONS, svg } from './dom';
import { routeHref, type Route } from './view';

export const THESIS_URL = 'https://github.com/beapoquiz/heterogeneous-kd-2d-hand-pose-estimation';
export const REPO_URL = 'https://github.com/beapoquiz/airslides';

let openSettings: (() => void) | null = null;

/** The settings panel registers itself here so any topbar can open it. */
export function registerSettingsOpener(fn: () => void): void {
  openSettings = fn;
}

export function settingsButton(extraClass = ''): HTMLButtonElement {
  const btn = h(
    'button',
    {
      class: `icon-btn ${extraClass}`.trim(),
      type: 'button',
      title: 'Settings',
      'aria-label': 'Settings',
      onclick: () => openSettings?.(),
    },
    svg(ICONS.gear),
  );
  return btn;
}

export function topbar(active: Route): HTMLElement {
  const link = (route: Route, label: string) =>
    h(
      'a',
      {
        href: routeHref(route),
        class: route === active ? 'nav-link active' : 'nav-link',
        'aria-current': route === active ? 'page' : null,
      },
      label,
    );
  return h(
    'header',
    { class: 'topbar' },
    h(
      'a',
      { class: 'brand', href: routeHref('present'), 'aria-label': 'AirSlides home' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '✋'),
      h('span', { class: 'brand-text' }, 'AirSlides'),
    ),
    h(
      'nav',
      { class: 'nav', 'aria-label': 'Main' },
      link('present', 'Present'),
      link('playground', 'Playground'),
      link('help', 'Help'),
    ),
    settingsButton(),
  );
}
