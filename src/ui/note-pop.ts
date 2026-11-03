import type { RenderResult } from '../notation/render';
import { getNotePop } from './prefs';

/**
 * Note pop: during auto playback each sounding notehead pops to twice its size and eases back.
 * hit() starts a pop when a note sounds; frame() animates every frame. Notes scale with a
 * transform attribute around their own notehead's center: CSS transform-box and
 * transform-origin resolve differently across browsers for SVG text (WebKit moves the glyph),
 * so neither is used. Not used while scrubbing or playing along, and off with reduced motion.
 */

/** How large a sounding note grows at its peak. */
const PEAK = 2;
/** How long a pop takes, up and back, in ms. */
const DURATION = 460;
/** The share of the pop spent growing; the rest eases back. */
const UP = 0.16;

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

export interface NotePopContext {
  result(): RenderResult | null;
}

export interface NotePopEngine {
  /** A note at this slot just sounded (its column is highlighted). */
  hit(m: number, s: number): void;
  /** Every frame while playing. */
  frame(): void;
  /** Removes every pop (stopped, scrubbing, playing along). */
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

interface Pop {
  note: Note;
  start: number;
}

/** The base transform an element had before it was scaled. */
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
    e.setAttribute(
      'transform',
      `${base} translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${s.toFixed(4)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})`.trim(),
    );
  }
}

function unscaleNote(note: Note) {
  scaleNote(note, 1);
  for (const e of note.parts) delete e.dataset[BASE];
}

export function createNotePop(ctx: NotePopContext): NotePopEngine {
  let pops: Pop[] = [];
  /** Columns lifted to the top of their line while their notes pop, and the spot they came from. */
  const raised = new Map<Element, Comment>();

  const on = () => getNotePop() && !reduceMotion?.matches;

  /**
   * Moves a note's column to the end of its line's group, so it draws over neighboring notes,
   * stems and beams. Measures and columns carry no transforms, so nothing moves on screen.
   */
  function raise(note: Note) {
    const col = note.head.closest('.col');
    const line = col?.closest('.system');
    if (!col || !line || raised.has(col) || !col.parentNode) return;
    // A placeholder keeps the column's exact spot, even when its neighbors are lifted too.
    const spot = document.createComment('');
    col.replaceWith(spot);
    raised.set(col, spot);
    line.appendChild(col);
  }

  function lower(col: Element) {
    const spot = raised.get(col);
    if (!spot) return;
    raised.delete(col);
    if (spot.parentNode) spot.replaceWith(col);
    else col.remove();
  }

  function reset() {
    for (const p of pops) unscaleNote(p.note);
    pops = [];
    for (const col of [...raised.keys()]) lower(col);
  }

  function hit(m: number, s: number) {
    if (!on()) return reset();
    const col = ctx.result()?.columns.get(`${m}:${s}`);
    const heads = [...(col?.querySelectorAll<SVGGraphicsElement>('.head') ?? [])];
    const start = performance.now();
    for (const head of heads) {
      const note = noteOf(head);
      pops = pops.filter((p) => p.note.head !== head);
      pops.push({ note, start });
      raise(note);
    }
  }

  function frame() {
    if (!on()) return reset();
    const now = performance.now();
    pops = pops.filter((p) => {
      const t = clamp01((now - p.start) / DURATION);
      if (t >= 1) {
        unscaleNote(p.note);
        const col = p.note.head.closest('.col');
        if (col && !pops.some((x) => x !== p && x.note.head.closest('.col') === col && now - x.start < DURATION)) lower(col);
        return false;
      }
      // Up fast to the peak, then ease back.
      const s = t < UP ? 1 + (PEAK - 1) * easeOut(t / UP) : 1 + (PEAK - 1) * (1 - smooth((t - UP) / (1 - UP)));
      scaleNote(p.note, s);
      return true;
    });
  }

  return { hit, frame, reset };
}
