import { meterOf } from '../notation/meter';
import type { Score } from '../notation/model';
import { S, type RenderResult, type TimelineSystem } from '../notation/render';
import { getBeatFx, onBeatFxChange, type BeatFx } from './prefs';

/**
 * Beat emphasis effects for auto playback (an experiment the reader picks from). Driven by the
 * playing score: hit() when a note sounds, frame() every animation frame with the playhead's
 * progress between slots. Every effect is animated here, frame by frame, through SVG geometry
 * attributes: notes scale with a transform attribute around their own notehead's center, rings
 * and glows grow by radius, the playhead by width. CSS transform-box and transform-origin
 * resolve differently across browsers for SVG text (WebKit moves the glyph), so none are used.
 * Not used while scrubbing or playing along, and off with reduced motion.
 */

const NS = 'http://www.w3.org/2000/svg';

interface Parts {
  breathe: number;
  pop: number;
  anticipate: number;
  ripple: number;
  glow: number;
  band: number;
}

const NONE: Parts = { breathe: 0, pop: 0, anticipate: 0, ripple: 0, glow: 0, band: 0 };

/** How strongly each effect plays in each variant (0 = off, 1 = full). */
const VARIANTS: Record<BeatFx, Parts> = {
  none: NONE,
  breathe: { ...NONE, breathe: 1 },
  pop: { ...NONE, pop: 1 },
  anticipate: { ...NONE, anticipate: 1 },
  ripple: { ...NONE, ripple: 1, glow: 1 },
  band: { ...NONE, band: 1 },
  combined: { ...NONE, breathe: 0.55, pop: 0.6, glow: 0.7 },
};

let current: BeatFx = getBeatFx();
onBeatFxChange(() => (current = getBeatFx()));

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

export interface BeatFxContext {
  result(): RenderResult | null;
  score(): Score;
  playhead(): SVGRectElement | null;
}

export interface BeatFxEngine {
  /** A note at this slot just sounded (its column is highlighted). */
  hit(m: number, s: number): void;
  /** Every frame while playing: the sounding slot, how far toward the next (0..1), and the playhead's x. */
  frame(m: number, s: number, progress: number, x: number): void;
  /** Removes every effect (stopped, scrubbing, playing along). */
  reset(): void;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const easeOut = (v: number) => 1 - (1 - v) ** 3;

/** A notehead with what belongs to it (ghost parentheses), and the point it grows around. */
interface Note {
  head: SVGGraphicsElement;
  parts: SVGGraphicsElement[];
  cx: number;
  cy: number;
}

/** A note growing and easing back: from 1 up to `peak` and back, or from `from` down to 1. */
interface Grow {
  note: Note;
  start: number;
  dur: number;
  peak?: number;
  from?: number;
}

/** A ring or glow spreading out from a note and fading. */
interface Spread {
  el: SVGCircleElement;
  start: number;
  dur: number;
  r0: number;
  r1: number;
  o0: number;
}

/** The base transform an element had before an effect scaled it. */
const BASE = 'fxBase';

/**
 * The center a notehead grows around, in its own coordinates: its glyph's horizontal middle
 * (from the engraver's glyph width), and the baseline, which SMuFL noteheads are centered on
 * vertically. Not the text's box: its height is the font's whole em box, and both its height
 * and width differ between browsers.
 */
function noteOf(head: SVGGraphicsElement): Note {
  const cx = Number(head.dataset.cx);
  const box = Number.isFinite(cx) ? null : head.getBBox();
  const parts = [head];
  for (let e = head.nextElementSibling; e?.classList.contains('head-mark'); e = e.nextElementSibling) {
    parts.push(e as SVGGraphicsElement);
  }
  return { head, parts, cx: box ? box.x + box.width / 2 : cx, cy: Number(head.getAttribute('y')) || 0 };
}

/** Scales a note in place, keeping any transform it already had. */
function scaleNote(note: Note, s: number) {
  for (const e of note.parts) {
    if (e.dataset[BASE] === undefined) e.dataset[BASE] = e.getAttribute('transform') ?? '';
    const base = e.dataset[BASE];
    if (Math.abs(s - 1) < 1e-3) {
      if (base) e.setAttribute('transform', base);
      else e.removeAttribute('transform');
      continue;
    }
    const { cx, cy } = note;
    const k = s.toFixed(4);
    e.setAttribute(
      'transform',
      `${base} translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${k}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})`.trim(),
    );
  }
}

function unscaleNote(note: Note) {
  scaleNote(note, 1);
  for (const e of note.parts) delete e.dataset[BASE];
}

export function createBeatFx(ctx: BeatFxContext): BeatFxEngine {
  let hitAt = -Infinity;
  let beatAt = -Infinity;
  let beatKey = '';
  let lastFx: BeatFx = current;
  /** Note slots (with a notehead), in playing order as absolute slot indices; rebuilt per render. */
  let onsets: number[] = [];
  let onsetsFor: RenderResult | null = null;
  let halo: SVGRectElement | null = null;
  let band: SVGRectElement | null = null;
  let breathing: SVGRectElement | null = null;
  /** Notes currently grown by anticipation. */
  let leaning: Note[] = [];
  let leaningKey = '';
  let grows: Grow[] = [];
  let spreads: Spread[] = [];

  const on = () => current !== 'none' && !reduceMotion?.matches;
  const parts = () => VARIANTS[current];

  function noteOnsets(result: RenderResult) {
    if (onsetsFor === result) return onsets;
    const slots = ctx.score().slots;
    onsets = [...result.columns.entries()]
      .filter(([, col]) => col.querySelector('.head'))
      .map(([key]) => {
        const [m, s] = key.split(':').map(Number);
        return m * slots + s;
      })
      .sort((a, b) => a - b);
    onsetsFor = result;
    return onsets;
  }

  const notes = (m: number, s: number) =>
    [...(ctx.result()?.columns.get(`${m}:${s}`)?.querySelectorAll<SVGGraphicsElement>('.head') ?? [])].map(noteOf);

  const colorMode = () => document.documentElement.classList.contains('color-notes');
  /** The note's own color in color mode, else the highlight color. */
  const tint = (head: SVGElement) => (colorMode() && head.style.getPropertyValue('--c')) || 'var(--hl)';

  function clearLean() {
    for (const n of leaning) {
      unscaleNote(n);
      for (const e of n.parts) e.style.removeProperty('fill');
    }
    leaning = [];
    leaningKey = '';
  }

  function clearPlayhead() {
    halo?.remove();
    halo = null;
    band?.remove();
    band = null;
    if (breathing) {
      const w = Number(breathing.getAttribute('width'));
      breathing.setAttribute('x', (Number(breathing.getAttribute('x')) + w / 2 - 1).toFixed(2));
      breathing.setAttribute('width', '2');
      breathing.style.removeProperty('opacity');
      breathing = null;
    }
  }

  function reset() {
    for (const g of grows) unscaleNote(g.note);
    grows = [];
    for (const sp of spreads) sp.el.remove();
    spreads = [];
    clearLean();
    clearPlayhead();
    hitAt = -Infinity;
    beatAt = -Infinity;
    beatKey = '';
  }

  function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, cls: string) {
    const e = document.createElementNS(NS, tag);
    e.setAttribute('class', cls);
    return e;
  }

  // ---- On each note ----

  function grow(note: Note, g: Omit<Grow, 'note' | 'start'>) {
    grows = grows.filter((x) => x.note.head !== note.head);
    grows.push({ note, start: performance.now(), ...g });
  }

  function spread(note: Note, cls: string, color: string, r0: number, r1: number, o0: number, dur: number, front: boolean) {
    const parent = note.head.parentNode as SVGGElement | null;
    if (!parent) return;
    const c = svgEl('circle', cls);
    c.setAttribute('cx', note.cx.toFixed(2));
    c.setAttribute('cy', note.cy.toFixed(2));
    c.setAttribute('r', r0.toFixed(2));
    c.style.opacity = String(o0);
    if (cls === 'fx-ring') c.style.stroke = color;
    else c.style.fill = color;
    // A base transform on the notehead applies to its ripple too.
    const base = note.head.dataset[BASE] ?? note.head.getAttribute('transform');
    if (base) c.setAttribute('transform', base);
    if (front) parent.appendChild(c);
    else parent.insertBefore(c, parent.firstChild);
    spreads.push({ el: c, start: performance.now(), dur, r0, r1, o0 });
  }

  function hit(m: number, s: number) {
    if (current !== lastFx) {
      reset();
      lastFx = current;
    }
    if (!on()) return;
    const list = notes(m, s);
    if (!list.length) return;
    hitAt = performance.now();
    const p = parts();
    // Anticipated notes settle back from their grown size; the column's highlight takes the color.
    const leaned = new Set(leaning.map((n) => n.head));
    const grownTo = 1 + 0.24 * p.anticipate;
    clearLean();
    for (const note of list) {
      if (p.anticipate && leaned.has(note.head)) {
        scaleNote(note, grownTo);
        grow(note, { dur: 240, from: grownTo });
      } else if (p.pop) grow(note, { dur: 340, peak: 1 + 0.38 * p.pop });
      const w = 2 * Math.abs(note.cx - Number(note.head.getAttribute('x')));
      const color = tint(note.head);
      if (p.glow) spread(note, 'fx-glow', color, w * 0.57, w * 1.19, 0.42 * p.glow, 420, false);
      if (p.ripple) spread(note, 'fx-ring', color, w * 0.63, w * 1.68, 0.85 * p.ripple, 560, true);
    }
  }

  // ---- Every frame ----

  function animate(now: number) {
    grows = grows.filter((g) => {
      const t = clamp01((now - g.start) / g.dur);
      let s: number;
      if (g.from !== undefined) s = g.from + (1 - g.from) * easeOut(t);
      else {
        // Up fast to the peak, then ease back.
        const up = 0.16;
        const peak = g.peak ?? 1;
        s = t < up ? 1 + (peak - 1) * easeOut(t / up) : 1 + (peak - 1) * (1 - smooth((t - up) / (1 - up)));
      }
      if (t >= 1) {
        unscaleNote(g.note);
        return false;
      }
      scaleNote(g.note, s);
      return true;
    });
    spreads = spreads.filter((sp) => {
      const t = clamp01((now - sp.start) / sp.dur);
      if (t >= 1 || !sp.el.isConnected) {
        sp.el.remove();
        return false;
      }
      const e = easeOut(t);
      sp.el.setAttribute('r', (sp.r0 + (sp.r1 - sp.r0) * e).toFixed(2));
      sp.el.style.opacity = (sp.o0 * (1 - t)).toFixed(3);
      return true;
    });
  }

  function findSys(m: number): TimelineSystem | null {
    return ctx.result()?.timeline.find((t) => t.measures.some((x) => x.index === m)) ?? null;
  }

  function breathe(amount: number, x: number, flash: number, approach: number, sys: TimelineSystem) {
    const ph = ctx.playhead();
    if (!ph) return;
    const svg = ph.ownerSVGElement!;
    if (!halo || halo.ownerSVGElement !== svg) {
      halo?.remove();
      halo = svgEl('rect', 'fx-halo');
      halo.setAttribute('rx', String(0.8 * S));
      svg.insertBefore(halo, ph);
    }
    const near = approach * approach * approach;
    const hw = 0.8 * S * (0.55 + 0.6 * flash + 0.35 * near);
    halo.setAttribute('x', (x - hw).toFixed(2));
    halo.setAttribute('width', (2 * hw).toFixed(2));
    halo.setAttribute('y', sys.staffTop.toFixed(1));
    halo.setAttribute('height', (sys.staffBottom - sys.staffTop).toFixed(1));
    halo.style.opacity = (amount * (0.3 * flash + 0.14 * near)).toFixed(3);
    breathing = ph;
    const pw = 2 * (1 + amount * (1.3 * flash + 0.6 * near - 0.25));
    ph.setAttribute('x', (x - pw / 2).toFixed(2));
    ph.setAttribute('width', pw.toFixed(2));
    ph.style.opacity = (0.55 + amount * (0.4 * flash + 0.15 * near - 0.12)).toFixed(3);
  }

  function lean(amount: number, next: number, approach: number) {
    const slots = ctx.score().slots;
    const key = String(next);
    if (key !== leaningKey) {
      clearLean();
      leaningKey = key;
      leaning = notes(Math.floor(next / slots), next % slots);
    }
    // Starts once the playhead is past a third of the way, so short gaps barely show it.
    const a = smooth(clamp01((approach - 0.35) / 0.65)) * amount;
    const base = colorMode() ? 'var(--c, var(--ink))' : 'var(--ink)';
    for (const n of leaning) {
      scaleNote(n, 1 + 0.24 * a);
      for (const e of n.parts) e.style.fill = `color-mix(in srgb, var(--hl) ${Math.round(a * 70)}%, ${base})`;
    }
  }

  function beatBand(amount: number, m: number, s: number, sys: TimelineSystem) {
    const svg = ctx.result()?.svg;
    const meas = sys.measures.find((x) => x.index === m);
    if (!svg || !meas) return;
    // The felt beat: a quarter in 4/4, a half in cut time, a dotted quarter in 6/8 and 12/8.
    const spans = meterOf(ctx.score()).beamSpans;
    const g = spans.find((x) => s >= x.start && s < x.start + x.len) ?? spans[spans.length - 1];
    const key = `${m}:${g.start}`;
    if (key !== beatKey) {
      beatKey = key;
      beatAt = performance.now();
    }
    if (!band || band.ownerSVGElement !== svg) {
      band?.remove();
      band = svgEl('rect', 'fx-band');
      band.setAttribute('rx', String(0.6 * S));
      svg.insertBefore(band, svg.firstChild);
    }
    const xs = meas.slotX;
    const half = ((xs[1] ?? meas.endX) - xs[0]) / 2;
    const x0 = xs[g.start] - half;
    const x1 = (xs[g.start + g.len] ?? meas.endX) - half;
    band.setAttribute('x', x0.toFixed(1));
    band.setAttribute('width', Math.max(1, x1 - x0).toFixed(1));
    band.setAttribute('y', sys.staffTop.toFixed(1));
    band.setAttribute('height', (sys.staffBottom - sys.staffTop).toFixed(1));
    const pulse = Math.exp(-(performance.now() - beatAt) / 260);
    const down = g.start === 0;
    band.style.opacity = (amount * (0.07 + (down ? 0.16 : 0.09) * pulse)).toFixed(3);
  }

  function frame(m: number, s: number, progress: number, x: number) {
    if (current !== lastFx) {
      reset();
      lastFx = current;
    }
    if (!on()) return;
    const result = ctx.result();
    const sys = findSys(m);
    if (!result || !sys) return;
    const now = performance.now();
    animate(now);
    const p = parts();
    const slots = ctx.score().slots;
    const here = m * slots + s;
    const list = noteOnsets(result);
    // Where the playhead is between the note it left and the next one: 0 at a note, 1 at the next.
    let prev = -1;
    let next = -1;
    for (const o of list) {
      if (o <= here) prev = o;
      else {
        next = o;
        break;
      }
    }
    const total = ctx.score().measures.length * slots;
    const nextAt = next >= 0 ? next : total + (list[0] ?? 0);
    const prevAt = prev >= 0 ? prev : (list[list.length - 1] ?? 0) - total;
    const approach = clamp01((here + progress - prevAt) / Math.max(1e-6, nextAt - prevAt));
    const flash = Math.exp(-(now - hitAt) / 150);

    if (p.breathe) breathe(p.breathe, x, flash, approach, sys);
    if (p.anticipate) lean(p.anticipate, next >= 0 ? next : (list[0] ?? -1), approach);
    if (p.band) beatBand(p.band, m, s, sys);
  }

  return { hit, frame, reset };
}
