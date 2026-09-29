import { h, svg } from '../ui/dom';
import {
  FIST_ICON,
  OPEN_PALM_ICON,
  PINCH_ICON,
  SWIPE_LEFT_ICON,
  THUMBS_UP_ICON,
} from '../ui/handIcons';
import { THESIS_URL } from '../ui/topbar';
import type { Deck, DeckHost, DeckSignal } from './deck';

interface SlideView {
  root: HTMLElement;
  update(): void;
}

interface TutorialState {
  handSeen: boolean;
  mini: number;
  didNext: boolean;
  didPrev: boolean;
  targets: { hot: boolean; done: boolean }[];
  blackoutOn: boolean;
  blackoutOff: boolean;
  timerStarted: boolean;
  timerPaused: boolean;
  locked: boolean;
  unlocked: boolean;
}

const MINI_CARDS = ['A', 'B', 'C'];
/** Laser targets (slide coordinates), clear of the text in each orientation. */
const TARGETS_LANDSCAPE = [
  { x: 0.76, y: 0.24 },
  { x: 0.9, y: 0.5 },
  { x: 0.74, y: 0.74 },
];
const TARGETS_PORTRAIT = [
  { x: 0.2, y: 0.72 },
  { x: 0.74, y: 0.7 },
  { x: 0.42, y: 0.87 }, // left of the camera bubble (bottom-right)
];
/** Hit radius as a share of the target's diameter-defining unit (slightly generous). */
const TARGET_HIT_SCALE = 1.2;
const LANDSCAPE = 16 / 9;

/** Landscape screens get 16:9; portrait phones get a slide shaped like the screen. */
function tutorialAspect(): number {
  const a = window.innerWidth / Math.max(1, window.innerHeight);
  return a >= 1 ? LANDSCAPE : Math.max(0.5, a);
}

function rich(text: string): HTMLParagraphElement {
  // **bold** only; text is authored here, never user input.
  const p = h('p');
  text.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (part.startsWith('**')) p.append(h('strong', {}, part.slice(2, -2)));
    else if (part) p.append(part);
  });
  return p;
}

function checklist(items: [string, () => boolean][]): { el: HTMLElement; update(): void } {
  const lis = items.map(([label]) => h('li', {}, label));
  const el = h('ul', { class: 'checklist' }, ...lis);
  return {
    el,
    update: () => items.forEach(([, done], i) => lis[i]?.classList.toggle('done', done())),
  };
}

/**
 * Built-in 7-slide interactive deck that teaches every gesture. Each slide
 * reacts to the gesture it teaches with a ✓ "Nice!" badge. Progress is kept
 * in the deck, so re-rendering (resize, navigating back) keeps it.
 */
export class TutorialDeck implements Deck {
  readonly kind = 'html';
  readonly title = 'Gesture tutorial';
  readonly count = 7;
  private live: { index: number; view: SlideView } | null = null;
  private celebrated = new Set<number>();
  private readonly s: TutorialState = {
    handSeen: false,
    mini: 0,
    didNext: false,
    didPrev: false,
    targets: TARGETS_LANDSCAPE.map(() => ({ hot: false, done: false })),
    blackoutOn: false,
    blackoutOff: false,
    timerStarted: false,
    timerPaused: false,
    locked: false,
    unlocked: false,
  };

  constructor(private readonly host: DeckHost) {}

  private currentAspect = LANDSCAPE;

  aspect(): number {
    this.currentAspect = tutorialAspect();
    return this.currentAspect;
  }

  private get targetLayout(): { x: number; y: number }[] {
    return this.currentAspect < 1 ? TARGETS_PORTRAIT : TARGETS_LANDSCAPE;
  }

  render(index: number, container: HTMLElement): void {
    const view = this.build(index);
    container.replaceChildren(view.root);
    this.live = { index, view };
    view.update();
    // already completed earlier: show the badge without re-animating
    if (this.celebrated.has(index)) view.root.querySelector('.nice')?.classList.add('show');
  }

  interceptNav(dir: 'next' | 'prev', index: number): boolean {
    if (index !== 1 || (this.s.didNext && this.s.didPrev)) return false;
    if (dir === 'next') {
      this.s.mini = Math.min(MINI_CARDS.length - 1, this.s.mini + 1);
      this.s.didNext = true;
    } else {
      this.s.mini = Math.max(0, this.s.mini - 1);
      this.s.didPrev = true;
    }
    this.refresh(index);
    return true;
  }

  signal(sig: DeckSignal, index: number): void {
    const s = this.s;
    switch (sig.type) {
      case 'hand':
        if (sig.present && !s.handSeen) s.handSeen = true;
        break;
      case 'laser':
        if (index === 2) this.laserAt(sig.x, sig.y);
        break;
      case 'laserEnd':
        s.targets.forEach((t) => (t.hot = false));
        break;
      case 'blackout':
        if (index === 3) {
          if (sig.active) s.blackoutOn = true;
          else if (s.blackoutOn) s.blackoutOff = true;
        }
        break;
      case 'timer':
        if (index === 4) {
          if (sig.running) s.timerStarted = true;
          else if (s.timerStarted) s.timerPaused = true;
        }
        break;
      case 'lock':
        if (index === 5) {
          if (sig.locked) s.locked = true;
          else if (s.locked) s.unlocked = true;
        }
        break;
    }
    this.refresh(index);
  }

  dispose(): void {
    this.live = null;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private laserAt(x: number, y: number): void {
    const a = this.currentAspect;
    // .target is 15 "slide units" wide: 15% of the height (landscape) or
    // 15 × 1.45% of the width (portrait) — see styles.css.
    const radius = (a >= 1 ? 0.075 : 0.075 * 1.45 * a) * TARGET_HIT_SCALE; // in slide heights
    this.s.targets.forEach((t, i) => {
      const p = this.targetLayout[i] as { x: number; y: number };
      t.hot = Math.hypot((x - p.x) * a, y - p.y) < radius;
      if (t.hot) t.done = true;
    });
  }

  private complete(index: number): boolean {
    const s = this.s;
    switch (index) {
      case 0:
        return s.handSeen;
      case 1:
        return s.didNext && s.didPrev;
      case 2:
        return s.targets.every((t) => t.done);
      case 3:
        return s.blackoutOn && s.blackoutOff;
      case 4:
        return s.timerStarted && s.timerPaused;
      case 5:
        return s.locked && s.unlocked;
      default:
        return false;
    }
  }

  private refresh(index: number): void {
    if (!this.live || this.live.index !== index) return;
    this.live.view.update();
    if (this.complete(index) && !this.celebrated.has(index)) {
      this.celebrated.add(index);
      this.live.view.root.querySelector('.nice')?.classList.add('show');
    }
  }

  private frame(
    index: number,
    step: string,
    title: string,
    art: string | null,
    ...body: (Node | null)[]
  ): HTMLElement {
    const text = h(
      'div',
      { class: 'tslide-text' },
      h('div', { class: 'step' }, `${index + 1} / ${this.count} · ${step}`),
      h('h1', {}, title),
      ...body,
    );
    const nice = h('div', { class: 'nice', 'aria-live': 'polite' }, '✓ Nice!');
    const content = art
      ? h('div', { class: 'row' }, h('div', { class: 'gesture-art' }, svg(art)), text)
      : text;
    return h('section', { class: 'tslide', 'aria-roledescription': 'slide' }, content, nice);
  }

  private build(index: number): SlideView {
    const s = this.s;
    switch (index) {
      case 0: {
        const status = h('div', { class: 'status-line' });
        const root = this.frame(
          0,
          'Welcome',
          'Present with your hands',
          SWIPE_LEFT_ICON,
          rich(
            'Raise **one hand** so the camera can see it — about an arm’s length away, palm toward the screen.',
          ),
          rich('Then **swipe left**: move your open hand quickly toward your left.'),
          status,
          h(
            'p',
            { class: 'kbd-hint' },
            'No camera? Use → and ← on your keyboard, or tap the slide.',
          ),
        );
        return {
          root,
          update: () => {
            status.textContent = s.handSeen ? '✓ I can see your hand' : 'Looking for your hand…';
            status.classList.toggle('good', s.handSeen);
          },
        };
      }
      case 1: {
        const cards = MINI_CARDS.map((c) => h('div', { class: 'mini-card' }, c));
        const list = checklist([
          ['Swipe left → next card', () => s.didNext],
          ['Swipe right → previous card', () => s.didPrev],
        ]);
        const done = h(
          'div',
          { class: 'status-line good', hidden: true },
          'Swipe left again to continue →',
        );
        const root = this.frame(
          1,
          'Swipe',
          'Next and previous',
          null,
          rich('Swipe **left** for the next slide, **right** to go back. Practise on these cards:'),
          h('div', { class: 'mini-deck' }, ...cards),
          list.el,
          rich(
            'After a swipe, your hand’s natural swing back is ignored for a second, so it never jumps back by accident.',
          ),
          done,
        );
        return {
          root,
          update: () => {
            cards.forEach((c, i) => c.classList.toggle('current', i === s.mini));
            list.update();
            done.hidden = !(s.didNext && s.didPrev);
          },
        };
      }
      case 2: {
        const targets = this.targetLayout.map((p) =>
          h('div', { class: 'target', style: `left:${p.x * 100}%;top:${p.y * 100}%` }),
        );
        const counter = h('div', { class: 'status-line' });
        const root = this.frame(
          2,
          'Laser pointer',
          'Pinch for the laser',
          PINCH_ICON,
          rich(
            'Touch your **thumb and index finger** together. A red dot follows your hand while you hold the pinch.',
          ),
          rich('Point at all three circles.'),
          counter,
          h('p', { class: 'kbd-hint' }, 'Your mouse works here too.'),
        );
        root.classList.add('narrow');
        root.append(h('div', { class: 'targets' }, ...targets));
        root.addEventListener('pointermove', (e) => {
          const r = root.getBoundingClientRect();
          this.laserAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
          this.refresh(2);
        });
        return {
          root,
          update: () => {
            s.targets.forEach((t, i) => {
              targets[i]?.classList.toggle('hot', t.hot);
              targets[i]?.classList.toggle('done', t.done);
            });
            const n = s.targets.filter((t) => t.done).length;
            counter.textContent = `${n} / 3 circles`;
            counter.classList.toggle('good', n === 3);
          },
        };
      }
      case 3: {
        const list = checklist([
          ['Black out the screen', () => s.blackoutOn],
          ['Bring the slide back', () => s.blackoutOff],
        ]);
        const root = this.frame(
          3,
          'Blackout',
          'Hold an open palm',
          OPEN_PALM_ICON,
          rich(
            'Hold an **open palm** still for about a second to black out the screen — handy when you want all eyes on you.',
          ),
          rich('Do it again to bring the slide back.'),
          list.el,
          h('p', { class: 'kbd-hint' }, 'Keyboard: B'),
        );
        return { root, update: list.update };
      }
      case 4: {
        const list = checklist([
          ['Start the timer', () => s.timerStarted],
          ['Pause it', () => s.timerPaused],
        ]);
        const root = this.frame(
          4,
          'Timer',
          'Thumbs up for the timer',
          THUMBS_UP_ICON,
          rich(
            'Hold a **thumbs up** still for a second to start the talk timer in the top-right corner. Do it again to pause.',
          ),
          list.el,
          h('p', { class: 'kbd-hint' }, 'Keyboard: T to start / pause, R to reset'),
        );
        return { root, update: list.update };
      }
      case 5: {
        const list = checklist([
          ['Lock gestures', () => s.locked],
          ['Unlock them', () => s.unlocked],
        ]);
        const root = this.frame(
          5,
          'Lock',
          'Make a fist to lock',
          FIST_ICON,
          rich(
            'Want to talk with your hands? Hold a **fist** for a second to lock gestures — the camera bubble dims and shows a lock.',
          ),
          rich('Hold a fist again to unlock.'),
          list.el,
          h('p', { class: 'kbd-hint' }, 'Keyboard: L'),
        );
        return { root, update: list.update };
      }
      default: {
        const root = this.frame(
          6,
          'Your turn',
          'Use your own slides',
          null,
          rich(
            'Export your deck from PowerPoint, Google Slides or Canva as a **PDF** and open it here. It never leaves your device.',
          ),
          h(
            'button',
            { class: 'btn btn-primary', type: 'button', onclick: () => this.host.openPdf() },
            'Open a PDF',
          ),
          h(
            'ul',
            { class: 'tips' },
            h('li', {}, 'Light your hand well and avoid a bright window behind you.'),
            h('li', {}, 'Stand 0.5–1.5 m from the camera; keep your hand inside the bubble.'),
            h('li', {}, 'Press ? any time for keyboard shortcuts.'),
          ),
          h(
            'p',
            { class: 'kbd-hint' },
            'Built alongside my thesis on real-time hand pose estimation: ',
            h(
              'a',
              { href: THESIS_URL, target: '_blank', rel: 'noopener' },
              'heterogeneous knowledge distillation',
            ),
            '.',
          ),
        );
        return { root, update: () => {} };
      }
    }
  }
}
