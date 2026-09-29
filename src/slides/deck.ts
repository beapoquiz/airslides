export interface SlideSize {
  /** CSS pixels. */
  width: number;
  height: number;
}

/** Things happening in the Present view that an interactive deck may react to. */
export type DeckSignal =
  | { type: 'hand'; present: boolean }
  | { type: 'laser'; x: number; y: number }
  | { type: 'laserEnd' }
  | { type: 'blackout'; active: boolean }
  | { type: 'timer'; running: boolean }
  | { type: 'lock'; locked: boolean };

/** Services the Present view offers to decks. */
export interface DeckHost {
  openPdf(): void;
}

export interface Deck {
  /** 'html' decks reflow to any aspect; 'pdf' pages keep theirs. */
  readonly kind: 'html' | 'pdf';
  readonly title: string;
  readonly count: number;
  /** Width ÷ height of slide `index` (0-based). */
  aspect(index: number): number;
  /** Load whatever `aspect(index)` needs (e.g. a PDF page's size). */
  ensure?(index: number): Promise<void>;
  /** Render slide `index` into `container`, which is already sized to `size`. */
  render(index: number, container: HTMLElement, size: SlideSize): Promise<void> | void;
  /** Warm caches for a slide that is likely to be shown next. */
  prerender?(index: number, size: SlideSize): void;
  /**
   * Let the current slide consume a *gesture* navigation (e.g. a practice
   * slide). Return true to swallow it. Keyboard navigation is never
   * intercepted.
   */
  interceptNav?(dir: 'next' | 'prev', index: number): boolean;
  signal?(signal: DeckSignal, index: number): void;
  dispose(): void;
}
