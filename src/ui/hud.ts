import { h } from './dom';

/** Short action toast at the bottom centre ("Next ▶", "Locked 🔒"). */
export class Hud {
  readonly el = h('div', { class: 'hud-toast', role: 'status', 'aria-live': 'polite' });
  private timer: number | null = null;

  show(text: string, ms = 700): void {
    this.el.textContent = text;
    this.el.classList.add('show');
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.el.classList.remove('show');
      this.timer = null;
    }, ms);
  }

  dispose(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
  }
}
