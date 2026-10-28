import type { Score } from '../notation/model';
import { renderScore, type RenderOptions, type RenderResult } from '../notation/render';

export type ViewOptions = Omit<RenderOptions, 'width'> & {
  /** CSS pixels per staff space on wide screens (default 10). */
  spacePx?: number;
  /** Smallest allowed fraction of the natural size before scrolling sideways (default 0.75). */
  minScale?: number;
};

export interface ScoreView {
  readonly element: HTMLElement;
  result: RenderResult | null;
  highlight(measure: number, slot: number): void;
  clear(): void;
  update(score?: Score, opts?: Partial<ViewOptions>): void;
  destroy(): void;
}

function pxPerUnit(width: number, spacePx: number) {
  const base = spacePx / 10;
  if (width < 420) return base * 0.78;
  if (width < 720) return base * 0.88;
  return base;
}

/** Renders a score into a container and keeps it responsive to the container width. */
export function mountScore(
  container: HTMLElement,
  initialScore: Score,
  initialOpts: ViewOptions = {},
  onRender?: (result: RenderResult) => void,
): ScoreView {
  let score = initialScore;
  let opts = { ...initialOpts };
  let lastWidth = 0;
  let active: Element[] = [];
  const host = document.createElement('div');
  host.className = 'score-host';
  container.appendChild(host);

  const view: ScoreView = {
    element: host,
    result: null,
    highlight(m, s) {
      view.clear();
      const col = view.result?.columns.get(`${m}:${s}`);
      const count = view.result?.counts.get(`${m}:${s}`);
      for (const node of [col, count]) {
        if (node) {
          node.classList.add('hl');
          active.push(node);
        }
      }
      if (col && host.scrollWidth > host.clientWidth) {
        const c = col.getBoundingClientRect();
        const hb = host.getBoundingClientRect();
        if (c.left < hb.left + 24 || c.right > hb.right - 24) {
          host.scrollTo({ left: host.scrollLeft + c.left - hb.left - hb.width / 3, behavior: 'smooth' });
        }
      }
    },
    clear() {
      active.forEach((n) => n.classList.remove('hl'));
      active = [];
    },
    update(nextScore, nextOpts) {
      if (nextScore) score = nextScore;
      if (nextOpts) opts = { ...opts, ...nextOpts };
      render(true);
    },
    destroy() {
      ro.disconnect();
      host.remove();
    },
  };

  function render(force = false) {
    const width = Math.floor(host.clientWidth || container.clientWidth);
    if (!width || (!force && width === lastWidth)) return;
    lastWidth = width;
    const ppu = pxPerUnit(width, opts.spacePx ?? 10);
    const { spacePx: _spacePx, minScale = 0.75, ...renderOpts } = opts;
    const result = renderScore(score, { ...renderOpts, width: width / ppu });
    // Never shrink notation below minScale of its natural size; scroll sideways instead.
    const scale = Math.max(width / result.width, ppu * minScale);
    const svgWidth = Math.ceil(result.width * scale);
    host.classList.toggle('scrolls', svgWidth > width + 1);
    result.svg.setAttribute('width', String(svgWidth));
    result.svg.setAttribute('height', String(Math.ceil(result.height * scale)));
    host.replaceChildren(result.svg);
    active = [];
    view.result = result;
    onRender?.(result);
  }

  let frame = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => render());
  });
  ro.observe(host);
  render(true);
  return view;
}
