import './styles.css';
import { getRuntime } from './runtime';
import { h } from './ui/dom';
import { createHelpView } from './ui/helpView';
import { createPlaygroundView } from './ui/playgroundView';
import { createPresentView } from './ui/presentView';
import { createSettingsPanel } from './ui/settingsPanel';
import { registerSettingsOpener } from './ui/topbar';
import type { Route, View } from './ui/view';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app missing');
const app: HTMLDivElement = root;

const ROUTES: Record<Route, () => View> = {
  present: () => createPresentView(),
  playground: () => createPlaygroundView(),
  help: () => createHelpView(),
};

function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return name in ROUTES ? (name as Route) : 'present';
}

let current: View | null = null;

function navigate(): void {
  current?.unmount();
  const view = ROUTES[parseRoute(location.hash)]();
  app.replaceChildren(view.el);
  current = view;
  view.mount?.();
  document.title = TITLES[parseRoute(location.hash)];
}

const TITLES: Record<Route, string> = {
  present: 'AirSlides — present with hand gestures',
  playground: 'Playground · AirSlides',
  help: 'Help · AirSlides',
};

// Settings dialog lives outside the routed views so it survives navigation.
const settingsPanel = createSettingsPanel();
document.body.append(settingsPanel.dialog);
registerSettingsOpener(settingsPanel.open);

// Skip link: focus <main> directly (a "#main" hash would hit the router).
document.body.prepend(
  h(
    'a',
    {
      class: 'skip-link',
      href: '#main',
      onclick: (e: Event) => {
        e.preventDefault();
        const main = document.getElementById('main');
        main?.setAttribute('tabindex', '-1');
        main?.focus();
      },
    },
    'Skip to content',
  ),
);

window.addEventListener('hashchange', navigate);
navigate();

// Dev-only handle for debugging from the console / Playwright. Stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as { __airslides: unknown }).__airslides = { runtime: getRuntime() };
}
