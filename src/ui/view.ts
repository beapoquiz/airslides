export interface View {
  readonly el: HTMLElement;
  /** Called after `el` is attached to the document. */
  mount?(): void;
  /** Release listeners, timers, and anything global. */
  unmount(): void;
}

export type Route = 'present' | 'playground' | 'help';

export function routeHref(route: Route): string {
  return `#/${route}`;
}
