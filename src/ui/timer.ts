import { h } from './dom';

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

/** Talk timer (mm:ss) in the top-right corner, hidden until first started. */
export class TalkTimer {
  readonly el = h('div', {
    class: 'timer',
    hidden: true,
    role: 'timer',
    'aria-label': 'Talk timer',
    'data-testid': 'timer',
  });
  private startedAt: number | null = null;
  private accumulated = 0;
  private tick: number | null = null;

  get running(): boolean {
    return this.startedAt !== null;
  }

  get elapsed(): number {
    return this.accumulated + (this.startedAt !== null ? performance.now() - this.startedAt : 0);
  }

  /** Start or pause. Returns true when now running. */
  toggle(): boolean {
    if (this.running) {
      this.accumulated = this.elapsed;
      this.startedAt = null;
      this.stopTicking();
    } else {
      this.startedAt = performance.now();
      this.el.hidden = false;
      this.tick = window.setInterval(() => this.render(), 250);
    }
    this.render();
    return this.running;
  }

  reset(): void {
    this.accumulated = 0;
    if (this.running) this.startedAt = performance.now();
    this.render();
  }

  /** Stop, zero and hide (deck closed). */
  clear(): void {
    this.accumulated = 0;
    this.startedAt = null;
    this.stopTicking();
    this.el.hidden = true;
    this.render();
  }

  private render(): void {
    this.el.textContent = formatElapsed(this.elapsed);
    this.el.classList.toggle('paused', !this.running);
  }

  private stopTicking(): void {
    if (this.tick !== null) window.clearInterval(this.tick);
    this.tick = null;
  }

  dispose(): void {
    this.stopTicking();
  }
}
