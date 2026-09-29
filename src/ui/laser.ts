import { fitCanvas, h } from './dom';

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

const TRAIL_MS = 220;

/**
 * Overlay canvas: a glowing laser dot with a short fading trail. Positions are
 * given in slide space ([0,1]²) and mapped onto the slide's on-screen rect.
 */
export class LaserOverlay {
  readonly el = h('canvas', { class: 'laser-canvas', 'aria-hidden': 'true' });
  private trail: TrailPoint[] = [];
  private head: TrailPoint | null = null;
  private active = false;
  private raf = 0;

  constructor(private readonly slideRect: () => DOMRect | null) {}

  move(x: number, y: number): void {
    this.active = true;
    this.head = { x, y, t: performance.now() };
    this.trail.push(this.head);
    this.schedule();
  }

  end(): void {
    this.active = false;
    this.schedule();
  }

  get visible(): boolean {
    return this.active;
  }

  private schedule(): void {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.draw());
  }

  private draw(): void {
    this.raf = 0;
    const now = performance.now();
    this.trail = this.trail.filter((p) => now - p.t < TRAIL_MS);
    const dpr = fitCanvas(this.el);
    const ctx = this.el.getContext('2d');
    const rect = this.slideRect();
    if (!ctx) return;
    ctx.clearRect(0, 0, this.el.width, this.el.height);
    if (!rect || (this.trail.length === 0 && !this.active)) return;

    const host = this.el.getBoundingClientRect();
    const px = (p: TrailPoint) => (rect.left - host.left + p.x * rect.width) * dpr;
    const py = (p: TrailPoint) => (rect.top - host.top + p.y * rect.height) * dpr;
    const r = Math.max(6, Math.min(rect.width, rect.height) * 0.012) * dpr;

    // fading trail
    ctx.lineCap = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1] as TrailPoint;
      const b = this.trail[i] as TrailPoint;
      const life = 1 - (now - b.t) / TRAIL_MS;
      ctx.strokeStyle = `rgba(255, 45, 85, ${0.45 * life})`;
      ctx.lineWidth = r * 1.1 * life;
      ctx.beginPath();
      ctx.moveTo(px(a), py(a));
      ctx.lineTo(px(b), py(b));
      ctx.stroke();
    }

    const head = this.head;
    if (this.active && head) {
      const x = px(head);
      const y = py(head);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
      glow.addColorStop(0, 'rgba(255, 45, 85, 0.55)');
      glow.addColorStop(1, 'rgba(255, 45, 85, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff2d55';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
    // keep animating while the trail fades or the laser is visible
    if (this.active || this.trail.length > 0) this.schedule();
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
  }
}
