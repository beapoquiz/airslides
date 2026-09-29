import type { HoldPose } from '../gestures/events';
import type { GestureRuntime } from '../runtime';
import { settings } from '../settings';
import { statusText } from './cameraStatus';
import { fitCanvas, h, ICONS, svg } from './dom';
import { drawSkeleton } from './skeleton';

const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;
const HOLD_GLYPH: Record<HoldPose, string> = { open_palm: '✋', thumbs_up: '👍', fist: '✊' };
const POSE_LABEL: Record<string, string> = {
  open_palm: 'Open palm',
  fist: 'Fist',
  thumbs_up: 'Thumbs up',
  other: 'Hand',
};

/**
 * Corner preview so the audience (and presenter) can see recognition working:
 * mirrored video, hand skeleton, current state / pose, and a ring that fills
 * while a hold gesture charges.
 */
export class CameraBubble {
  readonly el: HTMLElement;
  private readonly canvas = h('canvas', { 'aria-hidden': 'true' });
  private readonly label = h('div', { class: 'bubble-label', 'data-testid': 'bubble-label' });
  private readonly msg = h('div', { class: 'bubble-msg' });
  private readonly ring: SVGSVGElement;
  private readonly ringProgress: SVGCircleElement;
  private readonly ringGlyph: SVGTextElement;
  private readonly disposers: (() => void)[] = [];
  private raf = 0;

  constructor(private readonly rt: GestureRuntime) {
    this.ring = svg(
      `<svg class="bubble-ring" viewBox="0 0 38 38" aria-hidden="true">
        <circle class="track" cx="19" cy="19" r="${RING_R}"/>
        <circle class="progress" cx="19" cy="19" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/>
        <text x="19" y="20"></text>
      </svg>`,
    ) as SVGSVGElement;
    this.ringProgress = this.ring.querySelector('.progress') as SVGCircleElement;
    this.ringGlyph = this.ring.querySelector('text') as SVGTextElement;

    this.el = h(
      'div',
      {
        class: 'camera-bubble',
        'data-testid': 'camera-bubble',
        role: 'img',
        'aria-label': 'Camera preview with hand tracking',
      },
      this.msg,
      this.canvas,
      this.ring,
      h('div', { class: 'bubble-lock' }, svg(ICONS.lock)),
      this.label,
    );

    const ctl = rt.controller;
    this.disposers.push(
      rt.onFrame(() => this.schedule()),
      rt.onStatus(() => this.schedule()),
      ctl.on('stateChange', () => this.schedule()),
      ctl.on('holdProgress', ({ pose, progress }) => this.setRing(pose, progress)),
      settings.subscribe((s) => {
        this.el.dataset.size = s.bubbleSize;
        this.schedule();
      }),
    );
    this.el.dataset.size = settings.get().bubbleSize;
    this.setVisible(settings.get().bubbleVisible);
  }

  /** Move the shared <video> in (call after the bubble is in the document). */
  mount(): void {
    this.rt.mountVideo(this.el);
    this.schedule();
  }

  /** Hidden with opacity (not display:none) so video frames keep decoding. */
  setVisible(visible: boolean): void {
    this.el.classList.toggle('hidden', !visible);
  }

  get visible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  private setRing(pose: HoldPose | null, progress: number): void {
    const show = pose !== null && progress > 0.04;
    this.ring.classList.toggle('show', show);
    this.ringProgress.setAttribute('stroke-dashoffset', String(RING_C * (1 - progress)));
    this.ringGlyph.textContent = pose ? HOLD_GLYPH[pose] : '';
  }

  private schedule(): void {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.render());
  }

  private render(): void {
    this.raf = 0;
    const rt = this.rt;
    const ctl = rt.controller;
    const running = rt.status === 'running';
    this.msg.textContent = running ? '' : statusText(rt);
    this.el.classList.toggle('locked', ctl.locked);
    this.el.classList.toggle('pinching', ctl.pinching);

    const state = ctl.state;
    const d = ctl.debug;
    let text: string;
    if (!running) text = rt.status === 'idle' ? 'Camera off' : '…';
    else if (state === 'LOCKED') text = '🔒 Locked · fist to unlock';
    else if (state === 'BLACKOUT') text = 'Blackout · palm to restore';
    else if (state === 'NO_HAND') text = 'No hand';
    else if (state === 'PINCHING') text = '🔴 Laser';
    else text = d.pose ? (POSE_LABEL[d.pose] ?? 'Hand') : 'Hand';
    this.label.textContent = text;

    // Match the camera's real aspect (16:9 webcams, portrait phones) so the
    // skeleton lines up with the uncropped video.
    const { videoWidth: vw, videoHeight: vh } = rt.video;
    if (vw && vh) this.el.style.aspectRatio = `${vw} / ${vh}`;

    fitCanvas(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const hand = rt.lastFrame?.hands[0];
    if (running && hand && settings.get().showSkeleton && d.handPresent) {
      drawSkeleton(ctx, hand.landmarks, this.canvas.width, this.canvas.height, {
        highlightPinch: ctl.pinching,
        lineWidth: 2,
        pointRadius: 2.5,
      });
    }
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.disposers.forEach((d) => d());
  }
}
