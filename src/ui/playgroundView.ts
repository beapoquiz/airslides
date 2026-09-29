import { DEFAULT_CONFIG, SLIDERS, type SliderSpec } from '../config';
import type { HandFrame } from '../engine/types';
import type { GestureEventMap, GestureEventType } from '../gestures/events';
import { getRuntime } from '../runtime';
import { settings } from '../settings';
import { cameraStatusPanel } from './cameraStatus';
import { fitCanvas, h } from './dom';
import { drawSkeleton } from './skeleton';
import { topbar } from './topbar';
import type { View } from './view';

const POSE_LABEL: Record<string, string> = {
  open_palm: 'Open palm ✋',
  fist: 'Fist ✊',
  thumbs_up: 'Thumbs up 👍',
  other: 'Other',
};

const LOG_SKIP = new Set<GestureEventType>(['laserMove', 'holdProgress']);

function fmt(n: number | null | undefined, digits = 2): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toFixed(digits);
}

/** "Proof it works": live skeleton, every internal signal, threshold sliders. */
export function createPlaygroundView(extraPanels: HTMLElement[] = []): View {
  const rt = getRuntime();
  const ctl = rt.controller;
  const disposers: (() => void)[] = [];

  // ── video + overlay ────────────────────────────────────────────────────────
  const overlay = h('canvas', { class: 'pg-overlay', 'aria-hidden': 'true' });
  const videoBox = h('div', { class: 'pg-video' }, overlay);
  const status = cameraStatusPanel(rt);
  disposers.push(status.dispose);

  const skeletonToggle = h('input', {
    type: 'checkbox',
    id: 'pg-skel',
    checked: settings.get().showSkeleton,
  });
  skeletonToggle.addEventListener('change', () =>
    settings.update({ showSkeleton: skeletonToggle.checked }),
  );
  const idsToggle = h('input', {
    type: 'checkbox',
    id: 'pg-ids',
    checked: settings.get().showLandmarkIds,
  });
  idsToggle.addEventListener('change', () =>
    settings.update({ showLandmarkIds: idsToggle.checked }),
  );

  // ── readouts ───────────────────────────────────────────────────────────────
  const val = (testid: string) => h('dd', { 'data-testid': testid }, '—');
  const r = {
    fps: val('fps'),
    infer: val('inference-ms'),
    engine: val('engine'),
    hand: val('handedness'),
    canned: val('canned'),
    rule: val('rule-pose'),
    pose: val('final-pose'),
    fingers: val('fingers'),
    palm: val('palm-size'),
    state: val('controller-state'),
  };
  const row = (label: string, dd: HTMLElement) =>
    h('div', { class: 'readout' }, h('dt', {}, label), dd);
  const readouts = h(
    'dl',
    { class: 'readouts' },
    row('FPS', r.fps),
    row('Inference', r.infer),
    row('Engine', r.engine),
    row('Hand', r.hand),
    row('MediaPipe gesture', r.canned),
    row('Rule-based pose', r.rule),
    row('Final pose', r.pose),
    row('Fingers extended', r.fingers),
    row('Palm size', r.palm),
    row('Controller state', r.state),
  );

  // pinch bar (0 … 1 palm sizes)
  const pinchFill = h('div', { class: 'bar-fill' });
  const enterMark = h('div', { class: 'bar-mark enter', title: 'enter' });
  const exitMark = h('div', { class: 'bar-mark exit', title: 'exit' });
  const pinchValue = h('span', { class: 'mono' }, '—');
  const pinchBar = h(
    'div',
    { class: 'meter' },
    h(
      'div',
      { class: 'meter-head' },
      h('span', {}, 'Pinch ratio (thumb↔index ÷ palm)'),
      pinchValue,
    ),
    h('div', { class: 'bar' }, pinchFill, enterMark, exitMark),
    h(
      'div',
      { class: 'meter-legend' },
      h('span', { class: 'legend enter' }, 'enter'),
      h('span', { class: 'legend exit' }, 'exit'),
    ),
  );

  // speed sparkline
  const spark = h('canvas', {
    class: 'sparkline',
    'aria-label': 'Horizontal palm speed, last 2 seconds',
  });
  const speedValue = h('span', { class: 'mono' }, '—');
  const sparkBox = h(
    'div',
    { class: 'meter' },
    h(
      'div',
      { class: 'meter-head' },
      h('span', {}, 'Horizontal speed (palm/s, last 2 s)'),
      speedValue,
    ),
    spark,
  );
  const speedHistory: { t: number; v: number }[] = [];

  // hold progress
  const holdBars: Record<string, HTMLElement> = {};
  const holdBox = h(
    'div',
    { class: 'meter' },
    h('div', { class: 'meter-head' }, h('span', {}, 'Hold progress')),
  );
  for (const [pose, label] of [
    ['open_palm', 'Palm → blackout'],
    ['thumbs_up', 'Thumbs up → timer'],
    ['fist', 'Fist → lock'],
  ] as const) {
    const fill = h('div', { class: 'bar-fill' });
    holdBars[pose] = fill;
    holdBox.append(
      h('div', { class: 'hold-row' }, h('span', {}, label), h('div', { class: 'bar small' }, fill)),
    );
  }

  // event log
  const log = h('ol', { class: 'event-log', 'aria-live': 'off' });
  const logEntries: string[] = [];
  const pushLog = <K extends GestureEventType>(type: K, payload: GestureEventMap[K]) => {
    if (LOG_SKIP.has(type)) return;
    const detail = Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : '';
    const time = new Date().toLocaleTimeString([], { hour12: false });
    logEntries.unshift(`${time}  ${type}${detail}`);
    logEntries.length = Math.min(logEntries.length, 20);
    log.replaceChildren(...logEntries.map((e) => h('li', {}, e)));
  };
  disposers.push(ctl.onAny(pushLog));

  // ── sliders ────────────────────────────────────────────────────────────────
  const sliderInputs = new Map<
    string,
    { input: HTMLInputElement; out: HTMLOutputElement; spec: SliderSpec }
  >();
  const sliderList = h('div', { class: 'sliders' });
  for (const spec of SLIDERS) {
    const id = `sl-${spec.key}`;
    const input = h('input', {
      type: 'range',
      id,
      min: spec.min,
      max: spec.max,
      step: spec.step,
    });
    const out = h('output', { for: id, class: 'mono' });
    input.addEventListener('input', () => {
      settings.update({ gesture: { [spec.key]: Number(input.value) } });
      out.value = `${input.value}${spec.unit ? ` ${spec.unit}` : ''}`;
    });
    sliderInputs.set(spec.key, { input, out, spec });
    sliderList.append(
      h(
        'div',
        { class: 'slider' },
        h('label', { for: id }, spec.label, h('small', {}, ` default ${DEFAULT_CONFIG[spec.key]}`)),
        input,
        out,
      ),
    );
  }
  const syncSliders = () => {
    const cfg = settings.gestureConfig();
    for (const { input, out, spec } of sliderInputs.values()) {
      input.value = String(cfg[spec.key]);
      out.value = `${cfg[spec.key]}${spec.unit ? ` ${spec.unit}` : ''}`;
    }
  };
  syncSliders();
  const resetBtn = h(
    'button',
    {
      class: 'btn btn-small',
      type: 'button',
      onclick: () => {
        settings.resetGesture();
        syncSliders();
      },
    },
    'Reset to defaults',
  );

  // ── layout ─────────────────────────────────────────────────────────────────
  const el = h(
    'div',
    { class: 'page playground-page' },
    topbar('playground'),
    h(
      'main',
      { class: 'playground', id: 'main' },
      h(
        'section',
        { class: 'pg-stage', 'aria-label': 'Camera' },
        videoBox,
        h(
          'div',
          { class: 'pg-toolbar' },
          status.el,
          h('label', { class: 'check' }, skeletonToggle, ' Skeleton'),
          h('label', { class: 'check' }, idsToggle, ' Landmark numbers'),
        ),
      ),
      h(
        'aside',
        { class: 'pg-panel', 'aria-label': 'Live readouts' },
        h('h2', {}, 'Live readouts'),
        readouts,
        pinchBar,
        sparkBox,
        holdBox,
        h('h3', {}, 'Event log'),
        log,
      ),
      h(
        'section',
        { class: 'pg-tuning card', 'aria-label': 'Thresholds' },
        h('div', { class: 'card-head' }, h('h2', {}, 'Thresholds'), resetBtn),
        h('p', { class: 'muted' }, 'Changes apply instantly and are saved in this browser.'),
        sliderList,
      ),
      ...extraPanels,
    ),
  );

  // ── rendering ──────────────────────────────────────────────────────────────
  let raf = 0;
  const scheduleRender = () => {
    if (!raf) raf = requestAnimationFrame(render);
  };

  function render(): void {
    raf = 0;
    const frame = rt.lastFrame;
    const d = ctl.debug;
    const cfg = ctl.config;

    r.fps.textContent = rt.active ? String(rt.stats.fps) : '—';
    r.infer.textContent = rt.active ? `${fmt(rt.stats.inferenceMs, 1)} ms` : '—';
    r.engine.textContent = rt.engineLabel;
    r.hand.textContent =
      d.handPresent && frame?.hands[0]
        ? `${frame.hands[0].handedness} (${fmt(frame.hands[0].handednessScore)})`
        : 'none';
    r.canned.textContent = d.canned ? `${d.canned.name} (${fmt(d.canned.score)})` : '—';
    r.rule.textContent = d.rulePose ? (POSE_LABEL[d.rulePose] ?? d.rulePose) : '—';
    r.pose.textContent = d.pose ? `${POSE_LABEL[d.pose] ?? d.pose} · via ${d.poseSource}` : '—';
    r.fingers.textContent = d.handPresent
      ? `${d.fingers}/4${d.thumbExtended ? ' + thumb' : ''}`
      : '—';
    r.palm.textContent =
      d.palmSize && frame ? `${Math.round(d.palmSize * frame.videoHeight)} px` : '—';
    r.state.textContent = d.state;
    r.state.dataset.state = d.state;

    const ratio = d.pinchRatio;
    pinchValue.textContent = fmt(ratio);
    pinchFill.style.width = ratio === null ? '0%' : `${Math.min(1, ratio) * 100}%`;
    pinchFill.classList.toggle('active', ctl.pinching);
    enterMark.style.left = `${cfg.pinchEnter * 100}%`;
    exitMark.style.left = `${cfg.pinchExit * 100}%`;

    for (const [pose, fill] of Object.entries(holdBars)) {
      fill.style.width = `${(d.holds[pose as keyof typeof d.holds] ?? 0) * 100}%`;
    }

    speedValue.textContent = fmt(d.swipeSpeed, 1);
    drawSparkline();
    drawOverlay(frame);
  }

  function drawOverlay(frame: HandFrame | null): void {
    if (frame && frame.videoWidth && frame.videoHeight) {
      videoBox.style.aspectRatio = `${frame.videoWidth} / ${frame.videoHeight}`;
    }
    fitCanvas(overlay);
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const s = settings.get();
    const hand = frame?.hands[0];
    if (hand && s.showSkeleton) {
      drawSkeleton(ctx, hand.landmarks, overlay.width, overlay.height, {
        showIds: s.showLandmarkIds,
        highlightPinch: true,
      });
    }
  }

  function drawSparkline(): void {
    const now = performance.now();
    speedHistory.push({ t: now, v: ctl.debug.swipeSpeed });
    while (speedHistory.length && (speedHistory[0] as { t: number }).t < now - 2000)
      speedHistory.shift();
    const dpr = fitCanvas(spark);
    const ctx = spark.getContext('2d');
    if (!ctx) return;
    const w = spark.width;
    const hh = spark.height;
    ctx.clearRect(0, 0, w, hh);
    const maxV = Math.max(12, ctl.config.swipeMinSpeed * 2);
    const y = (v: number) => hh / 2 - (v / maxV) * (hh / 2 - 2 * dpr);
    const styles = getComputedStyle(spark);
    ctx.lineWidth = 1 * dpr;
    ctx.strokeStyle = styles.getPropertyValue('--spark-grid') || 'rgba(128,128,128,.4)';
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    for (const v of [ctl.config.swipeMinSpeed, -ctl.config.swipeMinSpeed]) {
      ctx.beginPath();
      ctx.moveTo(0, y(v));
      ctx.lineTo(w, y(v));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = styles.getPropertyValue('--spark-line') || '#7cc4ff';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    speedHistory.forEach((p, i) => {
      const x = ((p.t - (now - 2000)) / 2000) * w;
      const clamped = Math.max(-maxV, Math.min(maxV, p.v));
      if (i === 0) ctx.moveTo(x, y(clamped));
      else ctx.lineTo(x, y(clamped));
    });
    ctx.stroke();
  }

  disposers.push(rt.onFrame(scheduleRender));
  disposers.push(rt.onStatus(scheduleRender));
  disposers.push(
    settings.subscribe(() => {
      skeletonToggle.checked = settings.get().showSkeleton;
      idsToggle.checked = settings.get().showLandmarkIds;
      syncSliders();
      scheduleRender();
    }),
  );
  // keep readouts ticking (e.g. FPS → 0) even when no frames arrive
  const ticker = window.setInterval(scheduleRender, 500);
  disposers.push(() => window.clearInterval(ticker));

  return {
    el,
    mount() {
      rt.mountVideo(videoBox);
      void rt.start();
      scheduleRender();
    },
    unmount() {
      if (raf) cancelAnimationFrame(raf);
      disposers.forEach((d) => d());
    },
  };
}
