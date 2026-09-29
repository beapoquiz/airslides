import type { Landmark } from '../engine/types';
import { HAND_EDGES } from '../engine/types';

export interface SkeletonStyle {
  lineColor?: string;
  pointColor?: string;
  lineWidth?: number;
  pointRadius?: number;
  showIds?: boolean;
  /** Highlight thumb + index tips (the pinch pair). */
  highlightPinch?: boolean;
}

/**
 * Draw a hand skeleton over a canvas that displays the *mirrored* preview.
 * Landmarks are raw (un-mirrored) normalized coordinates, so x is flipped.
 * `w`/`h` are the canvas' drawing size in device pixels.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  lms: readonly Landmark[],
  w: number,
  h: number,
  style: SkeletonStyle = {},
): void {
  const scale = Math.max(1, Math.min(w, h) / 360);
  const lw = (style.lineWidth ?? 2.5) * scale;
  const r = (style.pointRadius ?? 3.5) * scale;
  const px = (l: Landmark) => (1 - l.x) * w;
  const py = (l: Landmark) => l.y * h;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = style.lineColor ?? 'rgba(124, 196, 255, 0.9)';
  ctx.beginPath();
  for (const [a, b] of HAND_EDGES) {
    const la = lms[a];
    const lb = lms[b];
    if (!la || !lb) continue;
    ctx.moveTo(px(la), py(la));
    ctx.lineTo(px(lb), py(lb));
  }
  ctx.stroke();

  lms.forEach((l, i) => {
    const pinchTip = style.highlightPinch && (i === 4 || i === 8);
    ctx.fillStyle = pinchTip ? '#ff5a6a' : (style.pointColor ?? '#ffffff');
    ctx.beginPath();
    ctx.arc(px(l), py(l), pinchTip ? r * 1.4 : r, 0, Math.PI * 2);
    ctx.fill();
  });

  if (style.showIds) {
    ctx.font = `${Math.round(11 * scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3 * scale;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = '#ffe27a';
    lms.forEach((l, i) => {
      const x = px(l) + r * 1.2;
      const y = py(l) - r * 0.6;
      ctx.strokeText(String(i), x, y);
      ctx.fillText(String(i), x, y);
    });
  }
}
