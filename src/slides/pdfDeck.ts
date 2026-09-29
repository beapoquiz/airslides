// pdf.js legacy build: includes the polyfills older iPad / Android browsers need.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { Deck, SlideSize } from './deck';

GlobalWorkerOptions.workerSrc = workerUrl;

const CACHE_LIMIT = 6;
/** Cap the backing store so huge screens / zoom levels don't exhaust memory. */
const MAX_CANVAS_PIXELS = 16_000_000;

/**
 * A PDF (exported from PowerPoint / Google Slides / Canva) rendered with
 * pdf.js at devicePixelRatio. Rendered canvases are cached per page + size,
 * and the neighbours of the current page are prerendered so navigation is
 * instant.
 */
export class PdfDeck implements Deck {
  readonly kind = 'pdf';
  readonly count: number;
  private readonly aspects = new Map<number, number>();
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private readonly inflight = new Map<string, Promise<HTMLCanvasElement>>();
  private disposed = false;

  private constructor(
    private readonly doc: PDFDocumentProxy,
    readonly title: string,
  ) {
    this.count = doc.numPages;
  }

  static async open(data: ArrayBuffer | Uint8Array, title: string): Promise<PdfDeck> {
    const base = import.meta.env.BASE_URL;
    const task = getDocument({
      data: data instanceof Uint8Array ? data : new Uint8Array(data),
      cMapUrl: `${base}pdfjs/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
      wasmUrl: `${base}pdfjs/wasm/`,
      iccUrl: `${base}pdfjs/iccs/`,
    });
    const doc = await task.promise;
    const deck = new PdfDeck(doc, title);
    await deck.ensure(0);
    return deck;
  }

  aspect(index: number): number {
    return this.aspects.get(index) ?? this.aspects.get(0) ?? 16 / 9;
  }

  async ensure(index: number): Promise<void> {
    if (this.aspects.has(index)) return;
    const page = await this.doc.getPage(index + 1);
    this.aspects.set(index, this.pageAspect(page));
  }

  private pageAspect(page: PDFPageProxy): number {
    const vp = page.getViewport({ scale: 1 });
    return vp.width / vp.height;
  }

  async render(index: number, container: HTMLElement, size: SlideSize): Promise<void> {
    const canvas = await this.canvasFor(index, size);
    if (this.disposed) return;
    canvas.setAttribute('aria-label', `Slide ${index + 1} of ${this.count}`);
    container.replaceChildren(canvas);
  }

  prerender(index: number, size: SlideSize): void {
    if (index < 0 || index >= this.count) return;
    void this.ensure(index)
      .then(() => this.canvasFor(index, this.fit(index, size)))
      .catch(() => {});
  }

  /** Neighbour pages may have a different aspect; fit them into the same box. */
  private fit(index: number, box: SlideSize): SlideSize {
    const a = this.aspect(index);
    return box.width / box.height > a
      ? { width: box.height * a, height: box.height }
      : { width: box.width, height: box.width / a };
  }

  private key(index: number, size: SlideSize, dpr: number): string {
    return `${index}@${Math.round(size.width * dpr)}x${Math.round(size.height * dpr)}`;
  }

  private canvasFor(index: number, size: SlideSize): Promise<HTMLCanvasElement> {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const key = this.key(index, size, dpr);
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key); // refresh LRU order
      this.cache.set(key, hit);
      return Promise.resolve(hit);
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const job = (async () => {
      const page = await this.doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      let scale = (size.width * dpr) / base.width;
      const pixels = base.width * base.height * scale * scale;
      if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.dataset.page = String(index + 1);
      await page.render({ canvas, viewport, background: '#ffffff' }).promise;
      canvas.dataset.rendered = 'true';
      this.cache.set(key, canvas);
      while (this.cache.size > CACHE_LIMIT) {
        const oldest = this.cache.keys().next().value as string;
        this.cache.delete(oldest);
      }
      return canvas;
    })();
    this.inflight.set(key, job);
    void job.finally(() => this.inflight.delete(key)).catch(() => {});
    return job;
  }

  dispose(): void {
    this.disposed = true;
    this.cache.clear();
    void this.doc.loadingTask.destroy();
  }
}
