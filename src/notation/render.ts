import { ENGRAVING, GLYPH, HEADS, TIME_DIGIT_ADVANCE, timeSigDigit } from './glyphs';
import { INSTRUMENTS, type Voice } from './instruments';
import { headOf, voiceOf, type Hit, type Measure, type Score } from './model';

/** One staff space in SVG user units. */
export const S = 10;
const FONT_SIZE = 4 * S;
const NS = 'http://www.w3.org/2000/svg';

export interface RenderOptions {
  /** Available width in SVG user units. */
  width: number;
  clef?: boolean;
  timeSig?: boolean;
  rests?: boolean;
  barlines?: boolean;
  colorize?: boolean;
  counts?: boolean;
  /** Text labels under the staff keyed by "measure:slot". */
  labels?: Record<string, string>;
  /** Adds transparent tap targets over every column. */
  hitAreas?: boolean;
}

export interface RenderResult {
  svg: SVGSVGElement;
  /**
   * Column groups keyed by "measure:slot". Each holds everything that belongs only to the
   * notes or rests at that slot: heads, stems, flags, ledger lines, fractional beams, dots,
   * articulations, grace notes and ghost parentheses. Beams shared by several notes are not
   * included.
   */
  columns: Map<string, SVGGElement>;
  /** Count labels keyed by "measure:slot". */
  counts: Map<string, SVGTextElement>;
  width: number;
  height: number;
}

interface NoteItem {
  slot: number;
  dur: number;
  hits: Hit[];
  voice: Voice;
  // Filled during drawing
  stemX?: number;
  stemStartY?: number;
  stemEndY?: number;
}

interface RestItem {
  slot: number;
  dur: number;
  voice: Voice;
  measureRest?: boolean;
}

interface VoiceNotation {
  notes: NoteItem[];
  rests: RestItem[];
  groups: NoteItem[][];
}

interface Column {
  slot: number;
  leftExtra: number;
  rightExtra: number;
  flex: number;
  x: number;
}

interface MeasureLayout {
  index: number;
  measure: Measure;
  voices: Partial<Record<Voice, VoiceNotation>>;
  columns: Column[];
  leftPad: number;
  rightPad: number;
  fixed: number;
  flex: number;
  startRepeat: boolean;
  endBar: 'none' | 'single' | 'final' | 'repeat';
  resolution: 1 | 2 | 4;
  contentEnd?: number;
}

const yOf = (pos: number) => ((8 - pos) * S) / 2;
const STAFF_TOP = 0;
const STAFF_BOTTOM = 4 * S;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

class Bounds {
  min = Infinity;
  max = -Infinity;
  add(...ys: number[]) {
    for (const y of ys) {
      if (y < this.min) this.min = y;
      if (y > this.max) this.max = y;
    }
  }
}

function glyph(parent: Element, ch: string, x: number, y: number, cls = 'ink', scale = 1) {
  const t = el('text', { x: r(x), y: r(y), class: `glyph ${cls}` }, parent);
  if (scale !== 1) t.setAttribute('font-size', String(FONT_SIZE * scale));
  t.textContent = ch;
  return t;
}

function rect(parent: Element, x1: number, y1: number, x2: number, y2: number, cls = 'ink') {
  return el(
    'rect',
    { x: r(Math.min(x1, x2)), y: r(Math.min(y1, y2)), width: r(Math.abs(x2 - x1)), height: r(Math.abs(y2 - y1)), class: cls },
    parent,
  );
}

const r = (n: number) => Math.round(n * 100) / 100;

const gapWidth = (gap: number) => S * (2.7 + 1.15 * Math.log2(gap));

function notateVoice(hits: Map<number, Hit[]>, beats: number, voice: Voice): VoiceNotation {
  const notes: NoteItem[] = [];
  const rests: RestItem[] = [];
  const groups: NoteItem[][] = [];
  if (hits.size === 0) {
    rests.push({ slot: 0, dur: beats * 4, voice, measureRest: true });
    return { notes, rests, groups };
  }
  const onsetsIn = (b: number) =>
    [...hits.keys()].filter((s) => s >= b * 4 && s < b * 4 + 4).sort((a, b2) => a - b2);
  for (let b = 0; b < beats; b++) {
    const onsets = onsetsIn(b);
    const start = b * 4;
    if (onsets.length === 0) {
      if (beats === 4 && b % 2 === 0 && onsetsIn(b + 1).length === 0) {
        rests.push({ slot: start, dur: 8, voice });
        b++;
      } else {
        rests.push({ slot: start, dur: 4, voice });
      }
      continue;
    }
    const lead = onsets[0] - start;
    if (lead === 1) rests.push({ slot: start, dur: 1, voice });
    if (lead === 2) rests.push({ slot: start, dur: 2, voice });
    if (lead === 3) {
      rests.push({ slot: start, dur: 2, voice });
      rests.push({ slot: start + 2, dur: 1, voice });
    }
    const beatNotes = onsets.map((slot, i) => ({
      slot,
      dur: (onsets[i + 1] ?? start + 4) - slot,
      hits: hits.get(slot)!,
      voice,
    }));
    notes.push(...beatNotes);
    if (beatNotes.length > 1) groups.push(beatNotes);
  }
  return { notes, rests, groups };
}

function splitVoices(measure: Measure) {
  const up = new Map<number, Hit[]>();
  const down = new Map<number, Hit[]>();
  for (const [slot, hits] of measure.hits) {
    for (const h of hits) {
      const target = voiceOf(h) === 'up' ? up : down;
      const list = target.get(slot) ?? [];
      list.push(h);
      target.set(slot, list);
    }
  }
  return { up, down };
}

function measureResolution(measure: Measure): 1 | 2 | 4 {
  let res: 1 | 2 | 4 = 1;
  for (const slot of measure.hits.keys()) {
    if (slot % 2 === 1) return 4;
    if (slot % 4 === 2) res = 2;
  }
  return res;
}

function layoutMeasures(score: Score, opts: Required<Omit<RenderOptions, 'labels'>>): MeasureLayout[] {
  const split = score.measures.map(splitVoices);
  const hasVoice = {
    up: split.some((v) => v.up.size > 0),
    down: split.some((v) => v.down.size > 0),
  };
  return score.measures.map((measure, index) => {
    const { up, down } = split[index];
    const voices: Partial<Record<Voice, VoiceNotation>> = {};
    if (hasVoice.up) voices.up = notateVoice(up, score.beats, 'up');
    if (hasVoice.down) voices.down = notateVoice(down, score.beats, 'down');

    const colSlots = new Set<number>();
    for (const v of Object.values(voices)) {
      v.notes.forEach((n) => colSlots.add(n.slot));
      if (opts.rests) v.rests.filter((x) => !x.measureRest).forEach((x) => colSlots.add(x.slot));
    }
    const sorted = [...colSlots].sort((a, b) => a - b);
    const columns: Column[] = sorted.map((slot, i) => {
      const hits = measure.hits.get(slot) ?? [];
      const mods = new Set(hits.flatMap((h) => h.mods));
      let leftExtra = 0;
      if (mods.has('ghost')) leftExtra += 0.6 * S;
      if (mods.has('drag')) leftExtra += 3.0 * S;
      else if (mods.has('flam')) leftExtra += 1.9 * S;
      const allNotes = Object.values(voices).flatMap((v) => v.notes.filter((n) => n.slot === slot));
      const dotted = allNotes.some((n) => n.dur === 3);
      let rightExtra = 0;
      if (mods.has('ghost')) rightExtra = Math.max(rightExtra, 0.5 * S);
      if (dotted) rightExtra = Math.max(rightExtra, 0.8 * S);
      if (mods.has('choke')) rightExtra = Math.max(rightExtra, 1.1 * S);
      const gap = (sorted[i + 1] ?? score.slots) - slot;
      return { slot, leftExtra, rightExtra, flex: gapWidth(gap), x: 0 };
    });

    const isFirst = index === 0;
    const isLast = index === score.measures.length - 1;
    const startRepeat = score.repeat && isFirst && opts.barlines;
    let endBar: MeasureLayout['endBar'] = 'none';
    if (opts.barlines) endBar = isLast ? (score.repeat ? 'repeat' : 'final') : 'single';
    const leftPad = (startRepeat ? 2.4 : 1.2) * S;
    const rightPad = endBar === 'repeat' ? 1.9 * S : endBar === 'final' ? 0.9 * S : 0.1 * S;
    const flex = columns.length ? columns.reduce((a, c) => a + c.flex, 0) : 8 * S;
    const fixed = leftPad + rightPad + columns.reduce((a, c) => a + c.leftExtra + c.rightExtra, 0);
    return {
      index,
      measure,
      voices,
      columns,
      leftPad,
      rightPad,
      fixed,
      flex,
      startRepeat,
      endBar,
      resolution: measureResolution(measure),
    };
  });
}

function timeSigWidth(score: Score) {
  const w = (n: number) => [...String(n)].reduce((a, d) => a + TIME_DIGIT_ADVANCE[+d], 0);
  return Math.max(w(score.beats), w(score.beatUnit)) * S;
}

export function renderScore(score: Score, options: RenderOptions): RenderResult {
  const opts = {
    clef: true,
    timeSig: true,
    rests: true,
    barlines: true,
    colorize: false,
    counts: false,
    hitAreas: false,
    ...options,
  };
  const layouts = layoutMeasures(score, opts);
  const clefWidth = opts.clef ? 3.6 * S : 0.6 * S;
  const tsWidth = opts.timeSig ? timeSigWidth(score) + 1.2 * S : 0;
  const headerWidth = (first: boolean) => clefWidth + (first ? tsWidth : 0);

  // Greedy line breaking, then re-run with the narrowest limit that keeps the
  // same line count so measures are spread evenly (no lonely last bar).
  const breakLines = (limit: number) => {
    const out: MeasureLayout[][] = [];
    let current: MeasureLayout[] = [];
    let used = headerWidth(true);
    for (const m of layouts) {
      const w = m.fixed + m.flex;
      if (current.length && used + w > limit) {
        out.push(current);
        current = [];
        used = headerWidth(false);
      }
      current.push(m);
      used += w;
    }
    if (current.length) out.push(current);
    return out;
  };
  let lines = breakLines(opts.width);
  if (lines.length > 1) {
    let lo = 0;
    let hi = opts.width;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (breakLines(mid).length <= lines.length) hi = mid;
      else lo = mid;
    }
    lines = breakLines(hi);
  }

  const svg = el('svg', { xmlns: NS, class: 'score' + (opts.colorize ? ' colorize' : '') });
  svg.setAttribute('font-family', 'Bravura');
  svg.setAttribute('font-size', String(FONT_SIZE));
  const columns = new Map<string, SVGGElement>();
  const counts = new Map<string, SVGTextElement>();

  let totalWidth = opts.width;
  let cursorY = 0;
  let firstMinY = 0;

  lines.forEach((line, li) => {
    const sys = el('g', { class: 'system' }, svg);
    const bounds = new Bounds();
    bounds.add(STAFF_TOP, STAFF_BOTTOM);
    const header = headerWidth(li === 0);
    const fixed = line.reduce((a, m) => a + m.fixed, 0);
    const flex = line.reduce((a, m) => a + m.flex, 0);
    const k = Math.max(1, (opts.width - header - fixed) / flex);
    const lineWidth = Math.max(opts.width, header + fixed + flex);
    totalWidth = Math.max(totalWidth, lineWidth);

    // Staff lines
    const staff = el('g', { class: 'staff' }, sys);
    for (let i = 0; i < 5; i++) {
      const y = i * S;
      rect(staff, 0, y - (ENGRAVING.staffLine * S) / 2, lineWidth, y + (ENGRAVING.staffLine * S) / 2, 'staff-line');
    }
    if (opts.clef) {
      glyph(sys, GLYPH.percussionClef, 1.0 * S, yOf(4));
    } else if (opts.barlines) {
      rect(sys, 0, STAFF_TOP, ENGRAVING.thinBarline * S, STAFF_BOTTOM);
    }
    if (li === 0 && opts.timeSig) {
      const tsX = clefWidth;
      const tsW = timeSigWidth(score);
      const drawNum = (n: number, y: number) => {
        const digits = [...String(n)].map(Number);
        const w = digits.reduce((a, d) => a + TIME_DIGIT_ADVANCE[d], 0) * S;
        let x = tsX + (tsW - w) / 2;
        for (const d of digits) {
          glyph(sys, timeSigDigit(d), x, y);
          x += TIME_DIGIT_ADVANCE[d] * S;
        }
      };
      drawNum(score.beats, yOf(6));
      drawNum(score.beatUnit, yOf(2));
    }

    let mx = header;
    for (const m of line) {
      const width = m.fixed + m.flex * k;
      drawMeasure(sys, m, mx, width, k, opts, bounds, columns);
      mx += width;
    }

    // Count / label row
    const rowY = Math.max(bounds.max + 2.0 * S, STAFF_BOTTOM + 3.2 * S);
    let rowUsed = false;
    for (const m of line) {
      if (opts.counts) {
        rowUsed = true;
        drawCounts(sys, m, score, rowY, counts);
      }
      if (opts.labels) {
        for (const c of m.columns) {
          const text = opts.labels[`${m.index}:${c.slot}`];
          if (!text) continue;
          rowUsed = true;
          const t = el('text', { x: r(c.x + 0.59 * S), y: r(rowY), class: 'label', 'text-anchor': 'middle' }, sys);
          t.textContent = text;
        }
      }
    }
    if (rowUsed) bounds.add(rowY + 0.6 * S);

    const top = bounds.min - 0.8 * S;
    const bottom = bounds.max + 0.8 * S;
    if (li === 0) firstMinY = top;
    const offset = li === 0 ? 0 : cursorY - top;
    sys.setAttribute('transform', `translate(0 ${r(offset)})`);
    cursorY = offset + bottom + 1.5 * S;
  });

  const height = cursorY - 1.5 * S - firstMinY;
  svg.setAttribute('viewBox', `0 ${r(firstMinY)} ${r(totalWidth)} ${r(height)}`);
  return { svg, columns, counts, width: totalWidth, height };
}

function drawMeasure(
  sys: SVGGElement,
  m: MeasureLayout,
  mx: number,
  width: number,
  k: number,
  opts: Required<Omit<RenderOptions, 'labels'>> & { labels?: Record<string, string> },
  bounds: Bounds,
  columns: Map<string, SVGGElement>,
) {
  const g = el('g', { class: 'measure', 'data-m': m.index }, sys);
  const end = mx + width;

  // Column positions
  let x = mx + m.leftPad;
  for (const c of m.columns) {
    x += c.leftExtra;
    c.x = x;
    x += c.flex * k + c.rightExtra;
  }
  m.contentEnd = x;
  const colX = (slot: number) => m.columns.find((c) => c.slot === slot)!.x;

  const colGroup = (slot: number) => {
    const key = `${m.index}:${slot}`;
    let cg = columns.get(key);
    if (!cg) {
      cg = el('g', { class: 'col', 'data-m': m.index, 'data-s': slot }, g);
      columns.set(key, cg);
    }
    return cg;
  };

  if (opts.hitAreas) {
    for (const c of m.columns) {
      const cg = colGroup(c.slot);
      const insts = (m.measure.hits.get(c.slot) ?? []).map((h) => h.inst).join(' ');
      cg.setAttribute('data-inst', insts);
      rect(cg, c.x - 1.4 * S, -6 * S, c.x + 2.6 * S, 10 * S, 'hit-area');
    }
  }

  // Start repeat
  if (m.startRepeat) {
    const bx = mx + 0.2 * S;
    rect(g, bx, STAFF_TOP, bx + ENGRAVING.thickBarline * S, STAFF_BOTTOM);
    const tx = bx + (ENGRAVING.thickBarline + ENGRAVING.barlineSeparation) * S;
    rect(g, tx, STAFF_TOP, tx + ENGRAVING.thinBarline * S, STAFF_BOTTOM);
    const dx = tx + (ENGRAVING.thinBarline + 0.35) * S;
    el('circle', { cx: r(dx + 0.2 * S), cy: yOf(5), r: 0.22 * S, class: 'ink' }, g);
    el('circle', { cx: r(dx + 0.2 * S), cy: yOf(3), r: 0.22 * S, class: 'ink' }, g);
  }

  // Beams shared by several notes live outside the columns, and are drawn on top of them.
  const beams = el('g', { class: 'beams' }, g);

  // Rests that are identical in both voices are drawn once, centered on the staff.
  const restKey = (r: RestItem) => `${r.slot}:${r.dur}:${r.measureRest ? 1 : 0}`;
  const downRests = new Set((m.voices.down?.rests ?? []).map(restKey));
  const shared = new Set((m.voices.up?.rests ?? []).map(restKey).filter((k) => downRests.has(k)));

  for (const voice of ['up', 'down'] as Voice[]) {
    const vn = m.voices[voice];
    if (!vn) continue;
    const multi = !!(m.voices.up && m.voices.down);

    // Rests
    if (opts.rests) {
      for (const rest of vn.rests) {
        const isShared = shared.has(restKey(rest));
        if (isShared && voice === 'down') continue;
        const off = multi && !isShared ? (voice === 'up' ? 2 : -4) : 0;
        let ch: string = GLYPH.restQuarter;
        let w = 1.08;
        let pos = 4 + off;
        let rx: number;
        if (rest.measureRest) {
          ch = GLYPH.restWhole;
          w = 1.128;
          pos = 6 + off;
          const contentStart = mx + m.leftPad;
          rx = (contentStart + end - m.rightPad) / 2 - (w * S) / 2;
        } else {
          if (rest.dur === 8) {
            ch = GLYPH.restHalf;
            w = 1.128;
          } else if (rest.dur === 2) {
            ch = GLYPH.rest8th;
            w = 0.988;
          } else if (rest.dur === 1) {
            ch = GLYPH.rest16th;
            w = 1.28;
          }
          rx = colX(rest.slot) + ((1.18 - w) * S) / 2;
        }
        glyph(rest.measureRest ? g : colGroup(rest.slot), ch, rx, yOf(pos), 'ink rest');
        bounds.add(yOf(pos) - 1.6 * S, yOf(pos) + 2 * S);
      }
    }

    // Noteheads and stems
    for (const note of vn.notes) {
      drawNoteHeads(colGroup(note.slot), note, colX(note.slot), bounds, opts.colorize);
    }

    // Stems, beams, flags
    const grouped = new Set<NoteItem>(vn.groups.flat());
    for (const note of vn.notes) {
      if (grouped.has(note)) continue;
      const tip = voice === 'up' ? headExtent(note).top - 3.5 * S : headExtent(note).bottom + 3.5 * S;
      note.stemEndY = voice === 'up' ? Math.min(tip, yOf(4)) : Math.max(tip, yOf(4));
      const cg = colGroup(note.slot);
      drawStem(cg, note);
      if (note.dur < 4) {
        const sx = note.stemX! - (ENGRAVING.stem * S) / 2;
        if (voice === 'up') {
          const ch = note.dur === 1 ? GLYPH.flag16thUp : GLYPH.flag8thUp;
          const ay = note.dur === 1 ? -0.088 : -0.04;
          glyph(cg, ch, sx, note.stemEndY + ay * S);
        } else {
          const ch = note.dur === 1 ? GLYPH.flag16thDown : GLYPH.flag8thDown;
          const ay = note.dur === 1 ? 0.128 : 0.132;
          glyph(cg, ch, sx, note.stemEndY + ay * S);
        }
      }
      bounds.add(note.stemEndY);
    }
    for (const group of vn.groups) {
      drawBeamGroup(beams, (n) => colGroup(n.slot), group, voice, bounds);
    }

    // Dots, rolls, chokes
    for (const note of vn.notes) {
      const cg = colGroup(note.slot);
      if (note.dur === 3) {
        for (const h of note.hits) {
          const pos = INSTRUMENTS[h.inst].pos;
          const dotPos = pos % 2 === 0 ? pos + 1 : pos;
          glyph(cg, GLYPH.augmentationDot, colX(note.slot) + 1.18 * S + 0.45 * S, yOf(dotPos));
        }
      }
      const mods = new Set(note.hits.flatMap((h) => h.mods));
      const midY = (note.stemStartY! + note.stemEndY!) / 2;
      if (mods.has('buzz')) glyph(cg, GLYPH.buzzRoll, note.stemX!, midY, 'ink mark');
      if (mods.has('roll')) glyph(cg, GLYPH.tremolo3, note.stemX!, midY, 'ink mark');
      if (mods.has('choke')) {
        const h = note.hits.find((hh) => hh.mods.includes('choke'))!;
        const y = yOf(INSTRUMENTS[h.inst].pos);
        const cx = voice === 'up' ? note.stemX! + 0.35 * S : colX(note.slot) + 1.5 * S;
        glyph(cg, GLYPH.choke, cx, y - 0.2 * S, 'ink mark');
        bounds.add(y - 1.3 * S);
      }
    }

    // Articulations at the stem end
    const notesWithMarks = vn.notes.filter((n) =>
      n.hits.some((h) => h.mods.some((md) => ['accent', 'marcato', 'open', 'closed', 'halfOpen'].includes(md))),
    );
    if (notesWithMarks.length) {
      const anyAccent = vn.notes.some((n) => n.hits.some((h) => h.mods.includes('accent') || h.mods.includes('marcato')));
      if (voice === 'up') {
        const ends = vn.notes.map((n) => Math.min(n.stemEndY!, headExtent(n).top));
        const row = Math.min(STAFF_TOP - 1.0 * S, ...ends.map((e) => e - 0.8 * S));
        for (const n of notesWithMarks) {
          const cg = colGroup(n.slot);
          const mods = new Set(n.hits.flatMap((h) => h.mods));
          if (mods.has('accent')) glyph(cg, GLYPH.accentAbove, n.stemX! - 0.678 * S, row, 'ink mark');
          if (mods.has('marcato')) glyph(cg, GLYPH.marcatoAbove, n.stemX! - 0.47 * S, row, 'ink mark');
          const row2 = anyAccent ? row - 1.45 * S : row;
          let top = anyAccent ? row - 1.0 * S : row;
          if (mods.has('open')) glyph(cg, GLYPH.open, n.stemX! - 0.608 * S, row2, 'ink mark');
          if (mods.has('closed')) glyph(cg, GLYPH.closed, n.stemX! - 0.544 * S, row2, 'ink mark');
          if (mods.has('halfOpen')) glyph(cg, GLYPH.halfOpen, n.stemX! - 0.61 * S, row2, 'ink mark');
          if (mods.has('open') || mods.has('closed') || mods.has('halfOpen')) top = row2 - 1.25 * S;
          bounds.add(top);
        }
      } else {
        const ends = vn.notes.map((n) => Math.max(n.stemEndY!, headExtent(n).bottom));
        const row = Math.max(STAFF_BOTTOM + 1.0 * S, ...ends.map((e) => e + 0.8 * S));
        for (const n of notesWithMarks) {
          const cg = colGroup(n.slot);
          const mods = new Set(n.hits.flatMap((h) => h.mods));
          if (mods.has('accent')) glyph(cg, GLYPH.accentBelow, n.stemX! - 0.678 * S, row, 'ink mark');
          if (mods.has('marcato')) glyph(cg, GLYPH.marcatoBelow, n.stemX! - 0.47 * S, row, 'ink mark');
          const row2 = anyAccent ? row + 1.45 * S : row;
          if (mods.has('open')) glyph(cg, GLYPH.open, n.stemX! - 0.608 * S, row2 + 1.22 * S, 'ink mark');
          if (mods.has('closed')) glyph(cg, GLYPH.closed, n.stemX! - 0.544 * S, row2 + 1.1 * S, 'ink mark');
          bounds.add(row2 + 1.3 * S);
        }
      }
    }
  }

  g.appendChild(beams);

  // End barline
  if (m.endBar === 'single') {
    rect(g, end - ENGRAVING.thinBarline * S, STAFF_TOP, end, STAFF_BOTTOM, 'ink barline');
  } else if (m.endBar === 'final' || m.endBar === 'repeat') {
    const thickX = end - ENGRAVING.thickBarline * S;
    rect(g, thickX, STAFF_TOP, end, STAFF_BOTTOM);
    const thinX = thickX - ENGRAVING.barlineSeparation * S - ENGRAVING.thinBarline * S;
    rect(g, thinX, STAFF_TOP, thinX + ENGRAVING.thinBarline * S, STAFF_BOTTOM);
    if (m.endBar === 'repeat') {
      const dx = thinX - 0.55 * S;
      el('circle', { cx: r(dx), cy: yOf(5), r: 0.22 * S, class: 'ink' }, g);
      el('circle', { cx: r(dx), cy: yOf(3), r: 0.22 * S, class: 'ink' }, g);
    }
  }
}

function headExtent(note: NoteItem) {
  const ys = note.hits.map((h) => yOf(INSTRUMENTS[h.inst].pos));
  return { top: Math.min(...ys), bottom: Math.max(...ys) };
}

function drawNoteHeads(
  cg: SVGGElement,
  note: NoteItem,
  x: number,
  bounds: Bounds,
  colorize: boolean,
) {
  const up = note.voice === 'up';
  const stemX = up ? x + 1.18 * S : x;
  note.stemX = stemX;
  const heads = note.hits
    .map((hit) => ({ hit, pos: INSTRUMENTS[hit.inst].pos, kind: headOf(hit) }))
    .sort((a, b) => (up ? a.pos - b.pos : b.pos - a.pos));

  let prevPos: number | null = null;
  let prevDisplaced = false;
  let stemStartY = up ? -Infinity : Infinity;

  for (const h of heads) {
    const metrics = HEADS[h.kind];
    const displaced: boolean = prevPos !== null && Math.abs(h.pos - prevPos) === 1 && !prevDisplaced;
    let nx: number;
    if (up) nx = displaced ? stemX - (ENGRAVING.stem * S) / 2 : stemX - metrics.up[0] * S;
    else nx = displaced ? stemX - metrics.width * S + (ENGRAVING.stem * S) / 2 : stemX - metrics.down[0] * S;
    const ny = yOf(h.pos);
    const info = INSTRUMENTS[h.hit.inst];

    // Ledger lines
    const ledgers: number[] = [];
    for (let p = 10; p <= h.pos; p += 2) ledgers.push(p);
    for (let p = -2; p >= h.pos; p -= 2) ledgers.push(p);
    for (const p of ledgers) {
      const ly = yOf(p);
      rect(
        cg,
        nx - ENGRAVING.ledgerExtension * S,
        ly - (ENGRAVING.ledger * S) / 2,
        nx + (metrics.width + ENGRAVING.ledgerExtension) * S,
        ly + (ENGRAVING.ledger * S) / 2,
      );
    }

    const head = glyph(cg, metrics.glyph, nx, ny, 'ink head');
    head.setAttribute('data-inst', info.id);
    if (colorize) head.setAttribute('style', `--c:${info.color}`);

    const mods = h.hit.mods;
    if (mods.includes('ghost')) {
      glyph(cg, GLYPH.parenLeft, nx - 0.56 * S, ny, 'ink head-mark');
      glyph(cg, GLYPH.parenRight, nx + (metrics.width + 0.32) * S, ny, 'ink head-mark');
    }
    if (mods.includes('flam')) {
      const gx = nx - (mods.includes('ghost') ? 2.45 : 1.85) * S;
      glyph(cg, GLYPH.graceAcciaccatura, gx, ny, 'ink grace');
      bounds.add(ny - 2.2 * S);
    }
    if (mods.includes('drag')) {
      const scale = 0.62;
      const hw = 1.18 * S * scale;
      const offset = mods.includes('ghost') ? 0.6 * S : 0;
      const xs = [nx - 3.0 * S - offset, nx - 1.75 * S - offset];
      const stemTop = ny - 2.6 * S;
      for (const gx of xs) {
        glyph(cg, GLYPH.noteheadBlack, gx, ny, 'ink grace', scale);
        rect(cg, gx + hw - 0.1 * S, ny - 0.1 * S, gx + hw, stemTop, 'ink grace');
      }
      const bx1 = xs[0] + hw - 0.1 * S;
      const bx2 = xs[1] + hw;
      rect(cg, bx1, stemTop, bx2, stemTop + 0.3 * S, 'ink grace');
      rect(cg, bx1, stemTop + 0.5 * S, bx2, stemTop + 0.8 * S, 'ink grace');
      bounds.add(stemTop);
    }

    const anchor = up ? metrics.up : metrics.down;
    const sy = ny - anchor[1] * S;
    stemStartY = up ? Math.max(stemStartY, sy) : Math.min(stemStartY, sy);
    bounds.add(ny - 0.8 * S, ny + 0.8 * S);
    prevPos = h.pos;
    prevDisplaced = displaced;
  }
  note.stemStartY = stemStartY;
}

function drawStem(parent: Element, note: NoteItem) {
  const half = (ENGRAVING.stem * S) / 2;
  rect(parent, note.stemX! - half, note.stemStartY!, note.stemX! + half, note.stemEndY!, 'ink stem');
}

function drawBeamGroup(
  parent: Element,
  owner: (note: NoteItem) => Element,
  group: NoteItem[],
  voice: Voice,
  bounds: Bounds,
) {
  const up = voice === 'up';
  const beamT = ENGRAVING.beam * S;
  const gap = ENGRAVING.beamSpacing * S;
  const half = (ENGRAVING.stem * S) / 2;
  const outer = up
    ? Math.min(...group.map((n) => headExtent(n).top)) - 3.5 * S
    : Math.max(...group.map((n) => headExtent(n).bottom)) + 3.5 * S;
  const beamY = up ? Math.min(outer, yOf(4)) : Math.max(outer, yOf(4));
  for (const n of group) {
    n.stemEndY = beamY;
    drawStem(owner(n), n);
  }
  const first = group[0];
  const last = group[group.length - 1];
  const dir = up ? 1 : -1;
  const level = (lvl: number) => [beamY + dir * lvl * (beamT + gap), beamY + dir * (lvl * (beamT + gap) + beamT)];
  const [p1, p2] = level(0);
  rect(parent, first.stemX! - half, p1, last.stemX! + half, p2, 'ink beam');

  const [s1, s2] = level(1);
  const covered = new Set<number>();
  for (let i = 0; i < group.length - 1; i++) {
    if (group[i].dur === 1 && group[i + 1].dur === 1) {
      rect(parent, group[i].stemX! - half, s1, group[i + 1].stemX! + half, s2, 'ink beam');
      covered.add(i).add(i + 1);
    }
  }
  group.forEach((n, i) => {
    if (n.dur !== 1 || covered.has(i)) return;
    const neighbor = i === 0 ? group[1] : group[i - 1];
    const len = Math.min(1.1 * S, Math.abs(neighbor.stemX! - n.stemX!) / 2);
    // A fractional beam belongs to its note alone, so it highlights with it.
    if (i === 0) rect(owner(n), n.stemX! - half, s1, n.stemX! + len, s2, 'ink beam');
    else rect(owner(n), n.stemX! - len, s1, n.stemX! + half, s2, 'ink beam');
  });
  bounds.add(beamY);
}

const COUNT_SYLLABLES = ['', 'e', '&', 'a'];

function drawCounts(sys: SVGGElement, m: MeasureLayout, score: Score, y: number, counts: Map<string, SVGTextElement>) {
  const step = 4 / m.resolution;
  const cols = m.columns;
  const xAt = (slot: number) => {
    const exact = cols.find((c) => c.slot === slot);
    if (exact) return exact.x + 0.59 * S;
    const prev = [...cols].reverse().find((c) => c.slot < slot);
    // A virtual column at the end of the measure lets counts under trailing rests spread out.
    const next = cols.find((c) => c.slot > slot) ?? { slot: score.slots, x: m.contentEnd ?? prev?.x ?? 0 };
    if (prev && next) {
      const t = (slot - prev.slot) / (next.slot - prev.slot);
      return prev.x + 0.59 * S + t * (next.x - prev.x);
    }
    return (prev ?? next)!.x + 0.59 * S;
  };
  if (!cols.length) return;
  for (let slot = 0; slot < score.slots; slot += step) {
    const sub = slot % 4;
    const text = sub === 0 ? String(slot / 4 + 1) : COUNT_SYLLABLES[sub];
    const onset = m.measure.hits.has(slot);
    const t = el(
      'text',
      {
        x: r(xAt(slot)),
        y: r(y),
        class: `count${sub === 0 ? ' beat' : ''}${onset ? ' onset' : ''}`,
        'text-anchor': 'middle',
      },
      sys,
    );
    t.textContent = text;
    counts.set(`${m.index}:${slot}`, t);
  }
}
