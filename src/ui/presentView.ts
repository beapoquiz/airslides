import { cameraPermission } from '../camera/camera';
import { getRuntime } from '../runtime';
import { settings } from '../settings';
import type { Deck, DeckSignal, SlideSize } from '../slides/deck';
import { TutorialDeck } from '../slides/tutorialDeck';
import { Blackout } from './blackout';
import { CameraBubble } from './cameraBubble';
import { cameraStatusPanel } from './cameraStatus';
import { h, ICONS, svg } from './dom';
import { Hud } from './hud';
import { LaserOverlay } from './laser';
import { actionForKey, isTypingTarget, shortcutsDialog, type PresentAction } from './shortcuts';
import { TalkTimer } from './timer';
import { settingsButton, THESIS_URL, topbar } from './topbar';
import type { View } from './view';

/** Survives navigating to Help / Playground and back (deck, position, talk timer). */
const session: { deck: Deck | null; index: number; timer: TalkTimer } = {
  deck: null,
  index: 0,
  timer: new TalkTimer(),
};

const IDLE_MS = 2500;

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function createPresentView(): View {
  const rt = getRuntime();
  const ctl = rt.controller;
  const root = h('div', { class: 'present-root' });
  const disposers: (() => void)[] = [];
  const winListeners: [string, EventListener][] = [];
  const listen = (type: string, fn: EventListener) => {
    window.addEventListener(type, fn);
    winListeners.push([type, fn]);
  };

  const fileInput = h('input', {
    type: 'file',
    accept: 'application/pdf,.pdf',
    class: 'visually-hidden',
    'data-testid': 'pdf-input',
    'aria-label': 'Open a PDF',
    tabindex: '-1',
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void openPdfFile(file);
  });
  root.append(fileInput);

  // ── start screen ───────────────────────────────────────────────────────────
  const status = cameraStatusPanel(rt);
  disposers.push(status.dispose);
  const errorBanner = h('p', { class: 'error-banner', role: 'alert', hidden: true });
  const dropzone = h(
    'div',
    { class: 'dropzone', 'data-testid': 'dropzone' },
    h('strong', {}, 'Drop a PDF here'),
    h('span', {}, 'Export your slides from PowerPoint, Google Slides or Canva as PDF.'),
  );
  const start = h(
    'div',
    { class: 'page' },
    topbar('present'),
    h(
      'main',
      { class: 'start', id: 'main' },
      h(
        'div',
        { class: 'start-inner' },
        h('h1', {}, 'AirSlides'),
        h(
          'p',
          { class: 'pitch' },
          'Present slides with hand gestures, right in your browser. Your camera never leaves your device.',
        ),
        status.el,
        h(
          'div',
          { class: 'start-actions' },
          h(
            'button',
            {
              class: 'btn btn-primary btn-large',
              type: 'button',
              'data-testid': 'start-tutorial',
              onclick: () => void openTutorial(),
            },
            svg(ICONS.play),
            'Start the gesture tutorial',
          ),
          h(
            'button',
            {
              class: 'btn btn-large',
              type: 'button',
              'data-testid': 'open-pdf',
              onclick: () => fileInput.click(),
            },
            svg(ICONS.file),
            'Open a PDF',
          ),
        ),
        dropzone,
        errorBanner,
        h(
          'p',
          { class: 'start-hint' },
          'Camera on? Raise an open hand and swipe left to start the tutorial.',
        ),
        h(
          'nav',
          { class: 'start-links', 'aria-label': 'More' },
          h('a', { href: '#/playground' }, 'Playground — see the tracking live'),
          h('a', { href: '#/help' }, 'Gestures & help'),
        ),
      ),
    ),
    h(
      'footer',
      { class: 'footer' },
      'Made by Bea Juliana Poquiz · Hand tracking by MediaPipe · Related: ',
      h(
        'a',
        { href: THESIS_URL, target: '_blank', rel: 'noopener' },
        'my thesis on real-time 2D hand pose estimation',
      ),
    ),
  );

  // ── presentation ───────────────────────────────────────────────────────────
  let pres: Presentation | null = null;

  function showStart(): void {
    pres?.dispose();
    pres = null;
    root.replaceChildren(fileInput, start);
    ctl.syncState({ blackout: false });
  }

  function showDeck(deck: Deck, index = 0): void {
    if (session.deck && session.deck !== deck) session.deck.dispose();
    session.deck = deck;
    session.index = Math.max(0, Math.min(index, deck.count - 1));
    pres?.dispose();
    pres = new Presentation(deck, {
      openPdf: () => fileInput.click(),
      close: () => {
        session.deck?.dispose();
        session.deck = null;
        session.index = 0;
        session.timer.clear();
        showStart();
      },
    });
    root.replaceChildren(fileInput, pres.el);
    pres.mount();
    void rt.start();
  }

  async function openTutorial(): Promise<void> {
    errorBanner.hidden = true;
    showDeck(new TutorialDeck({ openPdf: () => fileInput.click() }));
  }

  async function openPdfFile(file: File): Promise<void> {
    errorBanner.hidden = true;
    if (!isPdf(file)) {
      showError('That file isn’t a PDF. Export your slides as PDF and try again.');
      return;
    }
    pres?.hud.show('Opening deck…', 4000);
    try {
      const { PdfDeck } = await import('../slides/pdfDeck');
      const deck = await PdfDeck.open(await file.arrayBuffer(), file.name.replace(/\.pdf$/i, ''));
      showDeck(deck, 0);
    } catch (err) {
      console.error('[airslides] could not open PDF:', err);
      if (pres) pres.hud.show('Couldn’t open that PDF', 2000);
      else showError('Couldn’t open that PDF. It may be damaged or password-protected.');
    }
  }

  function showError(text: string): void {
    if (pres) {
      pres.hud.show(text, 2500);
      return;
    }
    errorBanner.textContent = text;
    errorBanner.hidden = false;
  }

  // Drag & drop anywhere on the view.
  let dragDepth = 0;
  listen('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    dropzone.classList.add('dragover');
  });
  listen('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropzone.classList.remove('dragover');
  });
  listen('dragover', (e) => e.preventDefault());
  listen('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove('dragover');
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file) void openPdfFile(file);
  });

  // Gestures on the start screen: swipe left starts the tutorial.
  disposers.push(
    ctl.on('next', () => {
      if (!pres) void openTutorial();
    }),
    ctl.on('toggleBlackout', ({ active }) => {
      if (!pres && active) ctl.syncState({ blackout: false }); // nothing to black out here
    }),
  );

  return {
    el: root,
    mount() {
      if (session.deck) showDeck(session.deck, session.index);
      else showStart();
      void cameraPermission().then((p) => {
        if (p === 'granted') void rt.start();
      });
    },
    unmount() {
      pres?.dispose();
      pres = null;
      disposers.forEach((d) => d());
      winListeners.forEach(([t, fn]) => window.removeEventListener(t, fn));
    },
  };
}

interface PresentationHost {
  openPdf(): void;
  close(): void;
}

/** The full-screen presenting UI for one deck. */
class Presentation {
  readonly el: HTMLElement;
  readonly hud = new Hud();
  private readonly rt = getRuntime();
  private readonly stage = h('div', { class: 'stage' });
  private readonly frame = h('div', { class: 'slide-frame', 'data-testid': 'slide-frame' });
  private readonly counter = h('div', {
    class: 'slide-counter',
    'data-testid': 'slide-counter',
    'aria-hidden': 'true',
  });
  private readonly live = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  private readonly timer = session.timer;
  private readonly blackout = new Blackout();
  private readonly laser: LaserOverlay;
  private readonly bubble: CameraBubble;
  private readonly help = shortcutsDialog();
  private readonly fsButton: HTMLButtonElement;
  private readonly disposers: (() => void)[] = [];
  private renderToken = 0;
  private idleTimer: number | null = null;
  private resizeTimer: number | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private handPresent = false;

  constructor(
    private readonly deck: Deck,
    host: PresentationHost,
  ) {
    this.laser = new LaserOverlay(() => this.frame.getBoundingClientRect());
    this.bubble = new CameraBubble(this.rt);
    this.stage.append(this.frame);

    const iconBtn = (label: string, icon: string, onclick: () => void, testid?: string) =>
      h(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          title: label,
          'aria-label': label,
          'data-testid': testid ?? null,
          onclick,
        },
        svg(icon),
      );
    this.fsButton = iconBtn('Fullscreen (F)', ICONS.fullscreen, () => this.toggleFullscreen());
    if (!document.fullscreenEnabled) this.fsButton.hidden = true;

    const chrome = h(
      'div',
      { class: 'present-chrome', role: 'toolbar', 'aria-label': 'Presentation controls' },
      iconBtn('Close deck', ICONS.close, () => host.close(), 'close-deck'),
      this.fsButton,
      iconBtn('Show / hide camera (C)', ICONS.camera, () => this.toggleBubble()),
      settingsButton(),
      iconBtn('Keyboard shortcuts (?)', ICONS.help, () => this.help.showModal()),
    );

    this.el = h(
      'div',
      {
        class: 'present',
        tabindex: '-1',
        'data-testid': 'present',
        'data-deck': deck.kind,
        'aria-roledescription': 'slide deck',
        'aria-label': deck.title,
      },
      this.stage,
      this.laser.el,
      this.blackout.el,
      chrome,
      this.counter,
      this.timer.el,
      this.hud.el,
      this.bubble.el,
      this.live,
      this.help,
      h(
        'div',
        { class: 'rotate-hint', 'aria-hidden': 'true' },
        'Turn your phone sideways for bigger slides',
      ),
    );
  }

  mount(): void {
    const ctl = this.rt.controller;
    ctl.syncState({ blackout: false });
    this.bubble.mount();

    this.disposers.push(
      ctl.on('next', () => this.gestureNav('next')),
      ctl.on('prev', () => this.gestureNav('prev')),
      ctl.on('laserMove', ({ x, y }) => {
        this.laser.move(x, y);
        this.signal({ type: 'laser', x, y });
      }),
      ctl.on('laserEnd', () => {
        this.laser.end();
        this.signal({ type: 'laserEnd' });
      }),
      ctl.on('toggleBlackout', ({ active }) => this.applyBlackout(active)),
      ctl.on('toggleTimer', () => this.toggleTimer()),
      ctl.on('toggleLock', ({ locked }) => {
        this.hud.show(locked ? 'Locked 🔒' : 'Unlocked 🔓');
        this.signal({ type: 'lock', locked });
      }),
      this.rt.onFrame(() => {
        const present = ctl.debug.handPresent;
        if (present !== this.handPresent) {
          this.handPresent = present;
          this.signal({ type: 'hand', present });
        }
      }),
    );

    const onKey = (e: KeyboardEvent) => this.onKey(e);
    const onResize = () => this.onResize();
    const onVisibility = () => {
      if (!document.hidden) void this.requestWakeLock();
    };
    const onPointer = () => this.wake();
    const onFs = () => this.onResize();
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFs);
    this.el.addEventListener('pointermove', onPointer);
    this.stage.addEventListener('click', (e) => this.onTap(e));
    this.disposers.push(() => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFs);
    });

    void this.requestWakeLock();
    void this.show(null);
    this.wake();
    this.el.focus?.();
  }

  // ── navigation ─────────────────────────────────────────────────────────────

  private gestureNav(dir: 'next' | 'prev'): void {
    if (this.blackout.on) return;
    if (this.deck.interceptNav?.(dir, session.index)) {
      this.hud.show(dir === 'next' ? 'Next ▶' : '◀ Previous');
      return;
    }
    this.step(dir === 'next' ? 1 : -1);
  }

  private step(delta: number): void {
    const target = session.index + delta;
    if (target < 0) {
      this.hud.show('First slide');
      return;
    }
    if (target >= this.deck.count) {
      this.hud.show('Last slide');
      return;
    }
    this.hud.show(delta > 0 ? 'Next ▶' : '◀ Previous');
    this.goTo(target);
  }

  private goTo(target: number): void {
    const clamped = Math.max(0, Math.min(this.deck.count - 1, target));
    if (clamped === session.index) return;
    const dir = clamped > session.index ? 'next' : 'prev';
    session.index = clamped;
    void this.show(dir);
    this.wake();
  }

  /** Render the current slide. `dir` null = no transition (first show, resize). */
  private async show(dir: 'next' | 'prev' | null): Promise<void> {
    const token = ++this.renderToken;
    const index = session.index;
    await this.deck.ensure?.(index);
    if (token !== this.renderToken) return;
    const size = this.layout(index);
    const content = h('div', {
      class: dir === 'prev' ? 'slide-content from-left' : 'slide-content',
    });
    if (dir === null) content.style.animation = 'none';
    try {
      await this.deck.render(index, content, size);
    } catch (err) {
      console.error('[airslides] slide render failed:', err);
      content.replaceChildren(h('p', { class: 'bubble-msg' }, 'This slide couldn’t be rendered.'));
    }
    if (token !== this.renderToken) return;
    this.frame.replaceChildren(content);
    this.frame.dataset.index = String(index);
    this.counter.textContent = `${index + 1} / ${this.deck.count}`;
    this.live.textContent = `Slide ${index + 1} of ${this.deck.count}`;
    this.signal({ type: 'hand', present: this.handPresent });
    this.deck.prerender?.(index + 1, size);
    this.deck.prerender?.(index - 1, size);
  }

  /** Size the slide frame to fit the viewport (letterboxed). */
  private layout(index: number): SlideSize {
    const aspect = this.deck.aspect(index);
    const w = this.stage.clientWidth || window.innerWidth;
    const hgt = this.stage.clientHeight || window.innerHeight;
    const size =
      w / hgt > aspect ? { width: hgt * aspect, height: hgt } : { width: w, height: w / aspect };
    size.width = Math.floor(size.width);
    size.height = Math.floor(size.height);
    this.frame.style.width = `${size.width}px`;
    this.frame.style.height = `${size.height}px`;
    return size;
  }

  private onResize(): void {
    this.layout(session.index);
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
    // re-render once resizing settles so PDF pages stay crisp
    this.resizeTimer = window.setTimeout(() => void this.show(null), 180);
  }

  // ── actions ────────────────────────────────────────────────────────────────

  private signal(s: DeckSignal): void {
    this.deck.signal?.(s, session.index);
  }

  private applyBlackout(active: boolean): void {
    this.blackout.set(active);
    if (active) this.laser.end();
    this.hud.show(active ? 'Blackout' : 'Back to the slide');
    this.signal({ type: 'blackout', active });
  }

  private toggleTimer(): void {
    const running = this.timer.toggle();
    this.hud.show(running ? '⏱ Timer started' : '⏱ Timer paused');
    this.signal({ type: 'timer', running });
  }

  private toggleBubble(): void {
    const visible = !this.bubble.visible;
    this.bubble.setVisible(visible);
    settings.update({ bubbleVisible: visible });
    this.hud.show(visible ? 'Camera shown' : 'Camera hidden');
  }

  private toggleFullscreen(): void {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  }

  private async requestWakeLock(): Promise<void> {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => (this.wakeLock = null));
      }
    } catch {
      /* not allowed (battery saver, background tab) — presenting still works */
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.help.open || document.querySelector('dialog[open]')) return;
    if (isTypingTarget(e.target)) return;
    const action = actionForKey(e);
    if (!action) return;
    e.preventDefault();
    this.run(action);
  }

  private run(action: PresentAction): void {
    const ctl = this.rt.controller;
    switch (action) {
      case 'next':
        if (this.blackout.on) ctl.toggleBlackout();
        else this.step(1);
        break;
      case 'prev':
        if (this.blackout.on) ctl.toggleBlackout();
        else this.step(-1);
        break;
      case 'first':
        this.goTo(0);
        break;
      case 'last':
        this.goTo(this.deck.count - 1);
        break;
      case 'blackout':
        ctl.toggleBlackout();
        break;
      case 'timer':
        this.toggleTimer();
        break;
      case 'timerReset':
        this.timer.reset();
        this.hud.show('⏱ Timer reset');
        break;
      case 'lock':
        ctl.toggleLock();
        break;
      case 'fullscreen':
        this.toggleFullscreen();
        break;
      case 'bubble':
        this.toggleBubble();
        break;
      case 'help':
        this.help.showModal();
        break;
    }
  }

  /** Tap / click: left third = previous, elsewhere = next. */
  private onTap(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (target?.closest('button, a, input, select, label, textarea')) return;
    if (this.blackout.on) return;
    const r = this.stage.getBoundingClientRect();
    this.step(e.clientX - r.left < r.width / 3 ? -1 : 1);
  }

  /** Show chrome + counter, then fade them after a moment of no activity. */
  private wake(): void {
    this.el.classList.remove('idle');
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => this.el.classList.add('idle'), IDLE_MS);
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.hud.dispose();
    this.laser.dispose();
    this.bubble.dispose();
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }
}
