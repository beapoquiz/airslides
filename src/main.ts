import './styles.css';
import { getRuntime } from './runtime';
import { h } from './ui/dom';
import { createPlaygroundView } from './ui/playgroundView';
import { topbar } from './ui/topbar';
import type { Route, View } from './ui/view';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app missing');
const app: HTMLDivElement = root;

function placeholder(route: Route): View {
  return {
    el: h(
      'div',
      { class: 'page' },
      topbar(route),
      h('main', { class: 'help' }, h('p', {}, 'Coming up next.')),
    ),
    unmount() {},
  };
}

const ROUTES: Record<Route, () => View> = {
  present: () => placeholder('present'),
  playground: () => createPlaygroundView(),
  help: () => placeholder('help'),
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
}

window.addEventListener('hashchange', navigate);
navigate();

// Dev-only handle for debugging from the console / Playwright. Stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as { __airslides: unknown }).__airslides = { runtime: getRuntime() };
}
