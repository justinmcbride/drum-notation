import { meterOf } from '../notation/meter';
import type { Score } from '../notation/model';
import { S, type RenderResult, type TimelineSystem } from '../notation/render';
import { getBeatFx, onBeatFxChange, type BeatFx } from './prefs';

/**
 * Beat emphasis effects for auto playback (an experiment the reader picks from). Driven by the
 * playing score: hit() when a note sounds, frame() every animation frame with the playhead's
 * progress between slots. Everything is transform and opacity on a handful of elements, so it
 * stays cheap on phones. Not used while scrubbing or playing along, and off with reduced motion.
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
  let styledHead: SVGElement | null = null;
  /** Noteheads currently grown by anticipation. */
  let leaning: SVGElement[] = [];
  let leaningKey = '';
  /** Ripples and glows still fading out. */
  const transient = new Set<SVGElement>();

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

  const heads = (m: number, s: number) =>
    [...(ctx.result()?.columns.get(`${m}:${s}`)?.querySelectorAll<SVGElement>('.head') ?? [])];

  const colorMode = () => document.documentElement.classList.contains('color-notes');
  /** The note's own color in color mode, else the highlight color. */
  const tint = (head: SVGElement) => (colorMode() && head.style.getPropertyValue('--c')) || 'var(--hl)';

  function clearLean() {
    for (const h of leaning) {
      h.style.removeProperty('transform');
      h.style.removeProperty('fill');
    }
    leaning = [];
    leaningKey = '';
  }

  function clearPlayhead() {
    halo?.remove();
    halo = null;
    band?.remove();
    band = null;
    if (styledHead) {
      styledHead.style.removeProperty('transform');
      styledHead.style.removeProperty('opacity');
      styledHead = null;
    }
  }

  function reset() {
    for (const e of transient) e.remove();
    transient.clear();
    for (const a of ctx.result()?.svg.getAnimations({ subtree: true }) ?? []) if (a.id === 'fx') a.cancel();
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

  function pop(head: SVGElement, amount: number, from = 1) {
    const peak = 1 + 0.38 * amount;
    head.animate(
      from === 1
        ? [{ transform: 'scale(1)' }, { transform: `scale(${peak})`, offset: 0.16 }, { transform: 'scale(1)' }]
        : [{ transform: `scale(${from})` }, { transform: 'scale(1)' }],
      { id: 'fx', duration: from === 1 ? 340 : 240, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    );
  }

  function ripple(head: SVGElement, ring: number, glow: number) {
    const parent = head.parentNode as SVGGElement | null;
    if (!parent) return;
    const box = (head as SVGGraphicsElement).getBBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const color = tint(head);
    if (glow) {
      const g = svgEl('circle', 'fx-glow');
      g.setAttribute('cx', cx.toFixed(1));
      g.setAttribute('cy', cy.toFixed(1));
      g.setAttribute('r', (box.width * 0.95).toFixed(1));
      g.style.fill = color;
      parent.insertBefore(g, parent.firstChild);
      transient.add(g);
      g.animate(
        [
          { transform: 'scale(0.6)', opacity: 0.42 * glow },
          { transform: 'scale(1.25)', opacity: 0 },
        ],
        { duration: 420, easing: 'ease-out' },
      ).onfinish = () => {
        g.remove();
        transient.delete(g);
      };
    }
    if (ring) {
      const c = svgEl('circle', 'fx-ring');
      c.setAttribute('cx', cx.toFixed(1));
      c.setAttribute('cy', cy.toFixed(1));
      c.setAttribute('r', (box.width * 0.7).toFixed(1));
      c.style.stroke = color;
      parent.appendChild(c);
      transient.add(c);
      c.animate(
        [
          { transform: 'scale(0.9)', opacity: 0.85 * ring },
          { transform: 'scale(2.4)', opacity: 0 },
        ],
        { duration: 560, easing: 'cubic-bezier(0.1, 0.6, 0.3, 1)' },
      ).onfinish = () => {
        c.remove();
        transient.delete(c);
      };
    }
  }

  function hit(m: number, s: number) {
    if (current !== lastFx) {
      reset();
      lastFx = current;
    }
    if (!on()) return;
    const list = heads(m, s);
    if (!list.length) return;
    hitAt = performance.now();
    const p = parts();
    // Anticipated heads hand over from their grown size; the column's highlight takes the color.
    const leaned = new Map(leaning.map((h) => [h, h.style.transform]));
    clearLean();
    for (const head of list) {
      const grown = leaned.get(head);
      if (p.anticipate && grown) pop(head, 0, 1 + 0.24 * p.anticipate);
      else if (p.pop) pop(head, p.pop);
      if (p.ripple || p.glow) ripple(head, p.ripple, p.glow);
    }
  }

  // ---- Every frame ----

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
      halo.setAttribute('width', String(1.6 * S));
      halo.setAttribute('rx', String(0.8 * S));
      svg.insertBefore(halo, ph);
    }
    const near = approach * approach * approach;
    halo.setAttribute('x', (x - 0.8 * S).toFixed(2));
    halo.setAttribute('y', sys.staffTop.toFixed(1));
    halo.setAttribute('height', (sys.staffBottom - sys.staffTop).toFixed(1));
    halo.style.opacity = (amount * (0.3 * flash + 0.14 * near)).toFixed(3);
    halo.style.transform = `scaleX(${(0.55 + 0.6 * flash + 0.35 * near).toFixed(3)})`;
    styledHead = ph;
    ph.style.transform = `scaleX(${(1 + amount * (1.3 * flash + 0.6 * near - 0.25)).toFixed(3)})`;
    ph.style.opacity = (0.55 + amount * (0.4 * flash + 0.15 * near - 0.12)).toFixed(3);
  }

  function lean(amount: number, next: number, approach: number) {
    const slots = ctx.score().slots;
    const key = String(next);
    if (key !== leaningKey) {
      clearLean();
      leaningKey = key;
      leaning = heads(Math.floor(next / slots), next % slots);
    }
    // Starts once the playhead is past a third of the way, so short gaps barely show it.
    const a = smooth(clamp01((approach - 0.35) / 0.65)) * amount;
    for (const h of leaning) {
      h.style.transform = `scale(${(1 + 0.24 * a).toFixed(3)})`;
      const base = colorMode() ? 'var(--c, var(--ink))' : 'var(--ink)';
      h.style.fill = `color-mix(in srgb, var(--hl) ${Math.round(a * 70)}%, ${base})`;
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
    const flash = Math.exp(-(performance.now() - hitAt) / 150);

    if (p.breathe) breathe(p.breathe, x, flash, approach, sys);
    if (p.anticipate) lean(p.anticipate, next >= 0 ? next : (list[0] ?? -1), approach);
    if (p.band) beatBand(p.band, m, s, sys);
  }

  return { hit, frame, reset };
}
