import type { Score } from './model';

/** A beat group, in sixteenth-note slots. */
export interface Group {
  start: number;
  len: number;
}

export interface Count {
  text: string;
  /** A counted beat (a number) rather than a subdivision. */
  beat: boolean;
}

export type ClickLevel = 'downbeat' | 'group' | 'beat';

/** How a time signature divides a measure, for engraving, counting and playback. */
export interface Meter {
  /** Measure length in sixteenth-note slots. */
  slots: number;
  /**
   * Beat groups in order. Note values and rests never cross a group boundary, and notes are
   * beamed within a group: quarter-note beats in simple time, dotted quarters (three eighths)
   * in compound time, and the written grouping (e.g. 2+2+3) in odd eighth-note meters.
   */
  groups: Group[];
  /** Spans beams may join adjacent groups across. Cut time beams four eighths per half note. */
  beamSpans: Group[];
  /** Two empty quarter beats on a half-note boundary may share a half rest (4/4 and 2/2). */
  halfRests: boolean;
  /** Slots per beat for tempo: bpm counts these. */
  tempoSlots: number;
  /** Count spacing never coarser than this, so every counted number shows. */
  maxCountStep: number;
  /** The count under a slot, if it has one. */
  count(slot: number): Count | null;
  /** Where the metronome clicks in a measure, and how strongly. */
  clicks: Map<number, ClickLevel>;
}

const SIMPLE_SYLLABLES = ['', 'e', '&', 'a'];
const COMPOUND_SYLLABLES = ['', '&', 'a'];

/** Default groupings, in eighth notes, for eighth-note meters that aren't compound. */
const ODD_GROUPINGS: Record<number, number[]> = {
  5: [3, 2],
  7: [2, 2, 3],
};

const cache = new WeakMap<Score, Meter>();

export function meterOf(score: Score): Meter {
  let meter = cache.get(score);
  if (!meter) {
    meter = buildMeter(score.beats, score.beatUnit, score.grouping);
    cache.set(score, meter);
  }
  return meter;
}

/** Measure length in sixteenth-note slots. */
export function measureSlots(beats: number, beatUnit: number) {
  return (beats * 16) / beatUnit;
}

function groupsOf(lengths: number[]): Group[] {
  let start = 0;
  return lengths.map((len) => {
    const g = { start, len };
    start += len;
    return g;
  });
}

export function groupAt(meter: Meter, slot: number): Group {
  return meter.groups.find((g) => slot >= g.start && slot < g.start + g.len) ?? meter.groups[meter.groups.length - 1];
}

function buildMeter(beats: number, beatUnit: number, grouping?: number[]): Meter {
  const slots = measureSlots(beats, beatUnit);

  if (beatUnit === 8) {
    const compound = beats % 3 === 0 && beats > 3;
    const eighths = grouping ?? (compound ? Array(beats / 3).fill(3) : (ODD_GROUPINGS[beats] ?? Array(beats).fill(1)));
    const groups = groupsOf(eighths.map((n) => n * 2));
    const starts = new Set(groups.map((g) => g.start));
    // 6/8 is counted in eighths ("1 2 3 4 5 6"); 9/8 and 12/8 by dotted-quarter beat ("1 & a 2 & a").
    const byGroup = compound && beats > 6;
    const clicks = new Map<number, ClickLevel>();
    if (byGroup) {
      groups.forEach((g, i) => clicks.set(g.start, i === 0 ? 'downbeat' : 'beat'));
    } else {
      for (let s = 0; s < slots; s += 2) clicks.set(s, s === 0 ? 'downbeat' : starts.has(s) ? 'group' : 'beat');
    }
    return {
      slots,
      groups,
      beamSpans: groups,
      halfRests: false,
      tempoSlots: compound ? 6 : 2,
      maxCountStep: 2,
      clicks,
      count(slot) {
        if (byGroup) {
          const i = groups.findIndex((g) => slot >= g.start && slot < g.start + g.len);
          const off = slot - groups[i].start;
          if (off % 2) return null;
          return off === 0 ? { text: String(i + 1), beat: true } : { text: COMPOUND_SYLLABLES[off / 2], beat: false };
        }
        if (slot % 2) return { text: '&', beat: false };
        return { text: String(slot / 2 + 1), beat: starts.has(slot) };
      },
    };
  }

  // Simple time: quarter-note groups. In cut time (x/2) the half note gets the beat.
  const beatSlots = beatUnit === 2 ? 8 : 4;
  const groups = groupsOf(Array(slots / 4).fill(4));
  const beamSpans = groupsOf(Array(slots / beatSlots).fill(beatSlots));
  const clicks = new Map<number, ClickLevel>();
  for (let s = 0; s < slots; s += beatSlots) clicks.set(s, s === 0 ? 'downbeat' : 'beat');
  const sub = beatSlots / 4;
  return {
    slots,
    groups,
    beamSpans,
    halfRests: slots === 16,
    tempoSlots: beatSlots,
    maxCountStep: 4,
    clicks,
    count(slot) {
      const off = slot % beatSlots;
      if (off % sub) return null;
      if (off === 0) return { text: String(slot / beatSlots + 1), beat: true };
      return { text: SIMPLE_SYLLABLES[off / sub], beat: false };
    },
  };
}
