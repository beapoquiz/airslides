type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

/**
 * Runs `step` once per new camera frame.
 *
 * - Uses requestVideoFrameCallback when available (fires exactly once per
 *   decoded frame), else requestAnimationFrame + a currentTime check.
 * - Never starts a new step while the previous one is pending: the next
 *   callback is only scheduled after `step` resolves.
 * - Pauses while the tab is hidden.
 * - Watchdog: some browsers stop firing rVFC for a video that isn't being
 *   painted (e.g. a hidden preview). If no tick arrives for 1 s, it falls back
 *   to requestAnimationFrame.
 */
export class FrameLoop {
  private running = false;
  private gen = 0;
  private useRVFC: boolean;
  private lastTickAt = 0;
  private lastVideoTime = -1;
  private watchdog: number | null = null;
  private readonly onVisibility = () => {
    if (!document.hidden) this.kick();
  };

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly step: () => Promise<void> | void,
  ) {
    this.useRVFC = typeof (video as VideoWithRVFC).requestVideoFrameCallback === 'function';
  }

  get mode(): 'rVFC' | 'rAF' {
    return this.useRVFC ? 'rVFC' : 'rAF';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.watchdog = window.setInterval(() => {
      if (!this.running || document.hidden) return;
      if (this.useRVFC && performance.now() - this.lastTickAt > 1000) {
        this.useRVFC = false;
        this.kick();
      }
    }, 1000);
    this.kick();
  }

  stop(): void {
    this.running = false;
    this.gen++;
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.watchdog !== null) window.clearInterval(this.watchdog);
    this.watchdog = null;
  }

  /** Start a fresh callback chain (invalidates any pending one). */
  private kick(): void {
    this.gen++;
    this.lastTickAt = performance.now();
    this.schedule(this.gen);
  }

  private schedule(gen: number): void {
    if (!this.running || gen !== this.gen || document.hidden) return;
    const v = this.video as VideoWithRVFC;
    if (this.useRVFC && v.requestVideoFrameCallback) {
      v.requestVideoFrameCallback(() => void this.tick(gen));
    } else {
      requestAnimationFrame(() => void this.tick(gen));
    }
  }

  private async tick(gen: number): Promise<void> {
    if (!this.running || gen !== this.gen) return;
    this.lastTickAt = performance.now();
    const v = this.video;
    const ready = v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && v.videoWidth > 0;
    // In rAF mode, skip display refreshes that didn't bring a new video frame.
    const fresh = this.useRVFC || v.currentTime !== this.lastVideoTime;
    if (ready && fresh) {
      this.lastVideoTime = v.currentTime;
      try {
        await this.step();
      } catch (err) {
        console.error('[airslides] frame step failed:', err);
      }
    }
    this.schedule(gen);
  }
}
