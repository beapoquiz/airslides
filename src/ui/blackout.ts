import { h } from './dom';

/** Full-screen black cover. A dim hint fades out after a couple of seconds. */
export class Blackout {
  readonly el = h(
    'div',
    { class: 'blackout', 'aria-hidden': 'true', 'data-testid': 'blackout' },
    h('span', { class: 'hint' }, 'Screen blacked out — hold an open palm or press B to return'),
  );

  set(on: boolean): void {
    this.el.classList.toggle('on', on);
    this.el.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  get on(): boolean {
    return this.el.classList.contains('on');
  }
}
