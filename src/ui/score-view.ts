import { auditionSlot } from '../audio/player';
import { meterOf } from '../notation/meter';
import type { Score } from '../notation/model';
import { renderScore, type RenderOptions, type RenderResult } from '../notation/render';
import { createNotePop } from './note-pop';

export type ViewOptions = Omit<RenderOptions, 'width'> & {
  /** CSS pixels per staff space on wide screens (default 10). */
  spacePx?: number;
  /** Smallest allowed fraction of the natural size before scrolling sideways (default 0.75). */
  minScale?: number;
  /** Lets the reader drag, tap or use the arrow keys on the score to choose the playback position. */
  scrub?: boolean;
};

/** A point in the music: measure index and sixteenth-note slot. */
export interface Position {
  m: number;
  s: number;
}

/** Lets a playing score follow scrubbing: hold on start, continue from the new spot on end. */
export interface ScrubHandler {
  start(): void;
  end(p: Position): void;
  /** Don't sound the notes passed over (the microphone is listening). */
  quiet?: boolean;
}

export interface ScoreView {
  readonly element: HTMLElement;
  result: RenderResult | null;
  /** Where the next Play starts (null = from the top). */
  position: Position | null;
  /** Set by the player while this score plays. */
  scrubber: ScrubHandler | null;
  highlight(measure: number, slot: number): void;
  /** Moves the playhead part of the way (progress 0..1) from a slot toward the next, for smooth playback. */
  glide(measure: number, slot: number, progress: number): void;
  /** Shows the playhead and highlight at a position, or hides them with null and returns to the top. */
  cue(p: Position | null): void;
  clear(): void;
  /** Briefly marks a wrong stroke at a position, at a staff position (0 = bottom line, 8 = top line). */
  flag(p: Position, staffPos: number): void;
  update(score?: Score, opts?: Partial<ViewOptions>): void;
  destroy(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

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
  /** Where the playhead is drawn (the cue, a scrub, or the playing slot). */
  let shown: Position | null = null;
  let playhead: SVGRectElement | null = null;
  /** When the playhead last glided (performance.now() ms); while recent, it drives sideways scrolling. */
  let glidedAt = -Infinity;
  /** The scroll target of a jump back into view, so it isn't restarted every frame. */
  let jumpTarget: number | null = null;
  const pop = createNotePop({ result: () => view.result });
  const host = document.createElement('div');
  host.className = 'score-host';
  container.appendChild(host);

  const view: ScoreView = {
    element: host,
    result: null,
    position: null,
    scrubber: null,
    highlight(m, s) {
      if (opts.scrub) drawPlayhead({ m, s });
      mark(m, s);
      if (opts.scrub) pop.hit(m, s);
    },
    glide(m, s, progress) {
      if (!opts.scrub) return;
      const x = glideX({ m, s }, progress);
      if (x === null) return;
      glidedAt = performance.now();
      drawPlayhead({ m, s }, x);
      follow(x);
      pop.frame();
    },
    cue(p) {
      glidedAt = -Infinity;
      pop.reset();
      view.position = p;
      if (p) {
        drawPlayhead(p);
        mark(p.m, p.s);
      } else {
        drawPlayhead(null);
        view.clear();
      }
      describe(p);
    },
    clear() {
      active.forEach((n) => n.classList.remove('hl'));
      active = [];
    },
    flag(p, staffPos) {
      const at = locate(p);
      const svg = view.result?.svg;
      if (!at || !svg) return;
      const space = (at.sys.lineBottom - at.sys.lineTop) / 4;
      const y = at.sys.lineBottom - (staffPos * space) / 2;
      const d = space * 0.45;
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'wrong-flag');
      g.setAttribute('aria-hidden', 'true');
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', at.x.toFixed(1));
      ring.setAttribute('cy', y.toFixed(1));
      ring.setAttribute('r', (space * 0.8).toFixed(1));
      const cross = document.createElementNS(SVG_NS, 'path');
      cross.setAttribute(
        'd',
        `M${(at.x - d).toFixed(1)} ${(y - d).toFixed(1)}L${(at.x + d).toFixed(1)} ${(y + d).toFixed(1)}M${(at.x + d).toFixed(1)} ${(y - d).toFixed(1)}L${(at.x - d).toFixed(1)} ${(y + d).toFixed(1)}`,
      );
      g.append(ring, cross);
      svg.appendChild(g);
      window.setTimeout(() => g.remove(), 900);
    },
    update(nextScore, nextOpts) {
      if (nextScore && nextScore !== score) {
        score = nextScore;
        view.position = null;
        shown = null;
        describe(null);
      }
      if (nextOpts) opts = { ...opts, ...nextOpts };
      setupScrub();
      render(true);
    },
    destroy() {
      ro.disconnect();
      host.remove();
    },
  };

  function mark(m: number, s: number) {
    view.clear();
    const col = view.result?.columns.get(`${m}:${s}`);
    const count = view.result?.counts.get(`${m}:${s}`);
    for (const node of [col, count]) {
      if (node) {
        node.classList.add('hl');
        active.push(node);
      }
    }
    // While gliding, follow() scrolls along with the playhead instead.
    const gliding = performance.now() - glidedAt < 250;
    if (col && !gliding && host.scrollWidth > host.clientWidth) {
      const c = col.getBoundingClientRect();
      const hb = host.getBoundingClientRect();
      if (c.left < hb.left + 24 || c.right > hb.right - 24) {
        host.scrollTo({ left: host.scrollLeft + c.left - hb.left - hb.width / 3, behavior: 'smooth' });
      }
    }
  }

  /** The line of music holding a measure, and the x of a slot in it. */
  function locate(p: Position) {
    for (const sys of view.result?.timeline ?? []) {
      const meas = sys.measures.find((x) => x.index === p.m);
      if (meas) return { sys, x: meas.slotX[p.s] ?? meas.slotX[0] };
    }
    return null;
  }

  /**
   * The x of a point part of the way through a slot: toward the next slot, or across the barline
   * to the next measure's first slot if it's on the same line. At the end of a line it runs to
   * the end of the measure, then jumps to the next line.
   */
  function glideX(p: Position, progress: number) {
    for (const sys of view.result?.timeline ?? []) {
      const i = sys.measures.findIndex((x) => x.index === p.m);
      if (i < 0) continue;
      const meas = sys.measures[i];
      const from = meas.slotX[p.s];
      if (from === undefined) return null;
      const nextMeas = sys.measures[i + 1];
      const to =
        meas.slotX[p.s + 1] ?? (nextMeas && nextMeas.index === p.m + 1 ? nextMeas.slotX[0] : undefined) ?? meas.endX;
      return from + (to - from) * progress;
    }
    return null;
  }

  /** Keeps a gliding playhead in view on a score wider than the screen, scrolling along with it. */
  function follow(x: number) {
    const svg = view.result?.svg;
    if (!svg || host.scrollWidth <= host.clientWidth + 1) return;
    const box = svg.getBoundingClientRect();
    const left = host.scrollLeft;
    // In the host's scrolled content: where the SVG starts, plus x scaled to CSS pixels.
    const px = box.left - host.getBoundingClientRect().left - host.clientLeft + left + x * (box.width / view.result!.width);
    const w = host.clientWidth;
    if (px < left + 16 || px > left + w - 16) {
      // Out of view (looped back, or the reader scrolled away): glide back to it once.
      const target = Math.max(0, px - w / 3);
      if (jumpTarget === null || Math.abs(jumpTarget - target) > w / 4) {
        jumpTarget = target;
        host.scrollTo({ left: target, behavior: 'smooth' });
      }
      return;
    }
    jumpTarget = null;
    // Past 40% of the width, the music scrolls under a playhead that stays put.
    const pin = px - w * 0.4;
    if (pin > left + 0.5) host.scrollTo({ left: pin, behavior: 'instant' });
  }

  function drawPlayhead(p: Position | null, glideTo?: number) {
    shown = p;
    const at = p && locate(p);
    if (!at || !view.result) {
      playhead?.remove();
      playhead = null;
      return;
    }
    if (!playhead || playhead.ownerSVGElement !== view.result.svg) {
      playhead?.remove();
      playhead = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      playhead.setAttribute('class', 'playhead');
      playhead.setAttribute('width', '2');
      playhead.setAttribute('rx', '1');
      // Behind the notes, so a highlighted note stays readable on top of it.
      view.result.svg.insertBefore(playhead, view.result.svg.firstChild);
    }
    playhead.setAttribute('x', ((glideTo ?? at.x) - 1).toFixed(2));
    playhead.setAttribute('y', at.sys.staffTop.toFixed(1));
    playhead.setAttribute('height', (at.sys.staffBottom - at.sys.staffTop).toFixed(1));
  }

  /** The grid slot nearest a point on screen: the closest line first, then the closest slot on it. */
  function positionAt(clientX: number, clientY: number): Position | null {
    const result = view.result;
    const ctm = result?.svg.getScreenCTM();
    if (!result || !ctm || !result.timeline.length) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    const gap = (t: { top: number; bottom: number }) => (pt.y < t.top ? t.top - pt.y : pt.y > t.bottom ? pt.y - t.bottom : 0);
    const sys = result.timeline.reduce((a, b) => (gap(b) < gap(a) ? b : a));
    let best: Position | null = null;
    let dist = Infinity;
    for (const meas of sys.measures) {
      meas.slotX.forEach((x, s) => {
        const d = Math.abs(x - pt.x);
        if (d < dist) {
          dist = d;
          best = { m: meas.index, s };
        }
      });
    }
    return best;
  }

  // ---- Scrubbing ----

  const total = () => score.measures.length * score.slots;
  const same = (a: Position | null, b: Position | null) => !!a && !!b && a.m === b.m && a.s === b.s;

  function describe(p: Position | null) {
    if (!opts.scrub) return;
    const at = p ?? { m: 0, s: 0 };
    const count = meterOf(score).count(at.s);
    host.setAttribute('aria-valuenow', String(at.m * score.slots + at.s));
    host.setAttribute(
      'aria-valuetext',
      `Bar ${at.m + 1}${count ? (count.beat ? `, beat ${count.text}` : `, “${count.text}”`) : ''}`,
    );
  }

  function setupScrub() {
    host.classList.toggle('scrub', !!opts.scrub);
    if (opts.scrub) {
      host.tabIndex = 0;
      host.setAttribute('role', 'slider');
      host.setAttribute('aria-label', 'Playback position: drag, tap, or use the arrow keys');
      host.setAttribute('aria-valuemin', '0');
      host.setAttribute('aria-valuemax', String(total() - 1));
      describe(view.position);
    } else {
      host.removeAttribute('tabindex');
      for (const a of ['role', 'aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) {
        host.removeAttribute(a);
      }
    }
  }

  let lastSound = 0;
  function sound(p: Position) {
    const now = performance.now();
    if (view.scrubber?.quiet) return;
    if (now - lastSound < 70 || !score.measures[p.m]?.hits.get(p.s)?.length) return;
    lastSound = now;
    auditionSlot(score, p.m, p.s);
  }

  /** Begins a scrub: a playing score holds until the scrub ends. */
  function scrubStart() {
    view.scrubber?.start();
  }

  function scrubTo(p: Position, audible: boolean) {
    glidedAt = -Infinity;
    pop.reset();
    if (same(p, shown) && active.length) return;
    view.position = p;
    drawPlayhead(p);
    mark(p.m, p.s);
    describe(p);
    if (audible) sound(p);
  }

  function scrubEnd() {
    const p = view.position ?? { m: 0, s: 0 };
    view.scrubber?.end(p);
  }

  /** A single jump (tap or key): a playing score continues from there; a stopped one sounds it. */
  function jump(p: Position) {
    scrubStart();
    scrubTo(p, !view.scrubber);
    scrubEnd();
  }

  const THRESHOLD = 8;
  let drag: { id: number; x: number; y: number; scrubbing: boolean } | null = null;

  host.addEventListener('pointerdown', (e) => {
    if (!opts.scrub || !e.isPrimary || drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, scrubbing: false };
    if (e.pointerType === 'mouse') {
      // Mice scrub right away; touch waits to see whether the finger is scrolling the page.
      e.preventDefault();
      host.focus({ preventScroll: true });
      beginDrag(e);
    }
  });

  function beginDrag(e: PointerEvent) {
    if (!drag) return;
    drag.scrubbing = true;
    try {
      host.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone; the scrub still ends on pointerup or pointercancel.
    }
    host.classList.add('scrubbing');
    scrubStart();
    const p = positionAt(e.clientX, e.clientY);
    if (p) scrubTo(p, !view.scrubber);
  }

  host.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.scrubbing) {
      const dx = Math.abs(e.clientX - drag.x);
      const dy = Math.abs(e.clientY - drag.y);
      if (dx > THRESHOLD && dx > dy * 1.2) beginDrag(e);
      else if (dy > THRESHOLD) drag = null;
      return;
    }
    const p = positionAt(e.clientX, e.clientY);
    if (p && !same(p, view.position)) scrubTo(p, true);
  });

  function finish(e: PointerEvent, cancelled: boolean) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    host.classList.remove('scrubbing');
    if (d.scrubbing) {
      if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
      scrubEnd();
    } else if (!cancelled) {
      // A tap seeks.
      const p = positionAt(e.clientX, e.clientY);
      if (p) jump(p);
    }
  }
  host.addEventListener('pointerup', (e) => finish(e, false));
  host.addEventListener('pointercancel', (e) => finish(e, true));

  /** Positions with a note or rest, in playing order. */
  function onsets(): Position[] {
    const keys = [...(view.result?.columns.keys() ?? [])].map((k) => {
      const [m, s] = k.split(':').map(Number);
      return { m, s };
    });
    return keys.sort((a, b) => a.m - b.m || a.s - b.s);
  }

  host.addEventListener('keydown', (e) => {
    if (!opts.scrub || e.altKey || e.ctrlKey || e.metaKey) return;
    const here = shown ?? view.position;
    const idx = (p: Position) => p.m * score.slots + p.s;
    const cur = here ? idx(here) : -1;
    const list = onsets();
    let to: Position | undefined;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        to = list.find((p) => idx(p) > cur);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        to = [...list].reverse().find((p) => idx(p) < cur) ?? { m: 0, s: 0 };
        break;
      case 'PageDown':
        to = here && here.m + 1 < score.measures.length ? { m: here.m + 1, s: 0 } : here ? undefined : { m: 0, s: 0 };
        break;
      case 'PageUp':
        to = { m: here ? (here.s > 0 ? here.m : Math.max(0, here.m - 1)) : 0, s: 0 };
        break;
      case 'Home':
        to = { m: 0, s: 0 };
        break;
      case 'End':
        to = list[list.length - 1];
        break;
      default:
        return;
    }
    e.preventDefault();
    if (to) jump(to);
  });

  function render(force = false) {
    const width = Math.floor(host.clientWidth || container.clientWidth);
    if (!width || (!force && width === lastWidth)) return;
    lastWidth = width;
    const ppu = pxPerUnit(width, opts.spacePx ?? 10);
    const { spacePx: _spacePx, minScale = 0.75, scrub: _scrub, ...renderOpts } = opts;
    const result = renderScore(score, { ...renderOpts, width: width / ppu });
    // Never shrink notation below minScale of its natural size; scroll sideways instead.
    const scale = Math.max(width / result.width, ppu * minScale);
    const svgWidth = Math.ceil(result.width * scale);
    host.classList.toggle('scrolls', svgWidth > width + 1);
    result.svg.setAttribute('width', String(svgWidth));
    result.svg.setAttribute('height', String(Math.ceil(result.height * scale)));
    host.replaceChildren(result.svg);
    active = [];
    playhead = null;
    view.result = result;
    if (shown) {
      drawPlayhead(shown);
      mark(shown.m, shown.s);
    }
    onRender?.(result);
  }

  let frame = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => render());
  });
  ro.observe(host);
  setupScrub();
  render(true);
  return view;
}
