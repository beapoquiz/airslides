import { CameraError, openCamera, stopCamera, type CameraErrorKind } from './camera/camera';
import { FrameLoop } from './camera/frameLoop';
import { engineInfo } from './engine/registry';
import type { HandFrame, LandmarkEngine } from './engine/types';
import { GestureController } from './gestures/controller';
import { settings } from './settings';

export type RuntimeStatus =
  'idle' | 'starting-camera' | 'loading-model' | 'running' | 'camera-error' | 'engine-error';

export interface RuntimeStats {
  fps: number;
  inferenceMs: number;
}

type FrameListener = (frame: HandFrame) => void;
type StatusListener = (status: RuntimeStatus) => void;

/**
 * App-wide singleton that owns the camera, the landmark engine, the frame
 * loop and the GestureController. Views subscribe to frames / controller
 * events and mount the shared <video>, so navigating between Present and
 * Playground never restarts the camera or reloads the model.
 */
export class GestureRuntime {
  readonly video: HTMLVideoElement;
  readonly controller: GestureController;
  status: RuntimeStatus = 'idle';
  cameraError: CameraErrorKind | null = null;
  engineError: string | null = null;
  engine: LandmarkEngine | null = null;
  lastFrame: HandFrame | null = null;
  readonly stats: RuntimeStats = { fps: 0, inferenceMs: 0 };

  private stream: MediaStream | null = null;
  private loop: FrameLoop | null = null;
  private starting: Promise<void> | null = null;
  private lastT = 0;
  private frameTimes: number[] = [];
  private frameListeners = new Set<FrameListener>();
  private statusListeners = new Set<StatusListener>();

  constructor() {
    this.video = document.createElement('video');
    this.video.className = 'camera-video';
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('muted', '');
    this.video.setAttribute('aria-label', 'Your camera preview (mirrored)');

    this.controller = new GestureController(settings.gestureConfig());
    settings.subscribe(() => this.controller.setConfig(settings.gestureConfig()));
  }

  get engineLabel(): string {
    return this.engine ? `${this.engine.label} · ${this.engine.backend}` : '—';
  }

  get active(): boolean {
    return this.status === 'running';
  }

  /** Start camera + engine. Safe to call repeatedly; resolves when running or failed. */
  start(): Promise<void> {
    if (this.status === 'running') return Promise.resolve();
    if (this.starting) return this.starting;
    this.starting = this.doStart().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async doStart(): Promise<void> {
    this.cameraError = null;
    this.engineError = null;

    if (!this.stream) {
      this.setStatus('starting-camera');
      try {
        this.stream = await openCamera(this.video);
      } catch (err) {
        this.cameraError = err instanceof CameraError ? err.kind : 'unknown';
        this.setStatus('camera-error');
        return;
      }
    }

    if (!this.engine) {
      this.setStatus('loading-model');
      const info = engineInfo(settings.get().engine);
      try {
        const engine = await info.create!();
        await engine.init();
        this.engine = engine;
      } catch (err) {
        console.error('[airslides] engine failed to load:', err);
        this.engineError = err instanceof Error ? err.message : String(err);
        this.setStatus('engine-error');
        return;
      }
    }

    if (!this.loop) {
      // Status stays "loading" until the first inference completes: the GPU
      // delegate compiles its shaders on the first frame, which can take a
      // few seconds on slower devices.
      this.loop = new FrameLoop(this.video, () => this.step());
      this.loop.start();
    }
  }

  stop(): void {
    this.loop?.stop();
    this.loop = null;
    stopCamera(this.stream);
    this.stream = null;
    this.video.srcObject = null;
    this.setStatus('idle');
  }

  private async step(): Promise<void> {
    const engine = this.engine;
    if (!engine) return;
    // MediaPipe's VIDEO mode requires strictly increasing timestamps.
    const t = Math.max(performance.now(), this.lastT + 1);
    this.lastT = t;
    const t0 = performance.now();
    const frame = await engine.detect(this.video, t);
    const dt = performance.now() - t0;
    if (this.status !== 'running') {
      this.setStatus('running'); // first frame done; its warm-up time is not a fair sample
    } else {
      this.stats.inferenceMs = this.stats.inferenceMs
        ? this.stats.inferenceMs * 0.9 + dt * 0.1
        : dt;
    }

    this.frameTimes.push(t);
    while (this.frameTimes.length > 0 && (this.frameTimes[0] as number) < t - 1000)
      this.frameTimes.shift();
    this.stats.fps = this.frameTimes.length;

    this.lastFrame = frame;
    this.controller.update(frame);
    for (const fn of this.frameListeners) fn(frame);
  }

  onFrame(fn: FrameListener): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(s: RuntimeStatus): void {
    this.status = s;
    for (const fn of this.statusListeners) fn(s);
  }

  /** Put the shared video element into `container` and make sure it plays. */
  mountVideo(container: HTMLElement): void {
    container.prepend(this.video);
    if (this.video.srcObject && this.video.paused) void this.video.play().catch(() => {});
  }
}

let instance: GestureRuntime | null = null;

export function getRuntime(): GestureRuntime {
  instance ??= new GestureRuntime();
  return instance;
}
