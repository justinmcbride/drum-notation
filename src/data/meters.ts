import type { ScoreSpec } from '../notation/model';

/** simple: beats split in two. compound: dotted-quarter beats split in three. odd: uneven groups of beats. */
export type MeterKind = 'simple' | 'compound' | 'odd';

/** The note value the tempo counts. */
export type BeatNote = 'half' | 'quarter' | 'dottedQuarter' | 'eighth';

export interface MeterExample {
  id: string;
  time: [number, number];
  /** What the meter is called. */
  name: string;
  /** The groove style. */
  style: string;
  kind: MeterKind;
  /** Shown only at the Advanced level. */
  advanced?: boolean;
  body: string;
  count: string;
  beat: BeatNote;
  bpm: number;
  minBpm: number;
  maxBpm: number;
  spec: ScoreSpec;
}

export const METER_EXAMPLES: MeterExample[] = [
  {
    id: '4-4',
    time: [4, 4],
    name: 'Four-four (common time)',
    style: 'Rock beat',
    kind: 'simple',
    body: 'Four quarter-note beats per bar: most rock, pop and funk is in 4/4. Eighths on the hi-hat, snare on 2 and 4, kick on 1 and 3.',
    count: '1 & 2 & 3 & 4 &',
    beat: 'quarter',
    bpm: 96,
    minBpm: 40,
    maxBpm: 200,
    spec: {
      time: [4, 4],
      grid: 2,
      repeat: true,
      bars: [
        { hh: 'xxxxxxxx', sn: '--x---x-', bd: 'x---x---' },
        { hh: 'xxxxxxxx', sn: '--x---x-', bd: 'x---xx--' },
      ],
    },
  },
  {
    id: '3-4',
    time: [3, 4],
    name: 'Three-four',
    style: 'Waltz',
    kind: 'simple',
    body: 'Three quarter-note beats per bar, felt “ONE two three”. The kick takes beat 1 and the snare answers on 2 and 3, the classic “oom-pah-pah” of a waltz.',
    count: '1 & 2 & 3 &',
    beat: 'quarter',
    bpm: 132,
    minBpm: 60,
    maxBpm: 220,
    spec: {
      time: [3, 4],
      grid: 2,
      repeat: true,
      bars: [
        { hh: 'xxxxxx', sn: '--x-x-', bd: 'x-----' },
        { hh: 'xxxxxx', sn: '--x-x-', bd: 'x----x' },
      ],
    },
  },
  {
    id: '2-4',
    time: [2, 4],
    name: 'Two-four',
    style: 'March / polka',
    kind: 'simple',
    body: 'Just two quarter-note beats per bar, so the bars fly by. Kick on the beats and snare on the “&”s give the “oom-pah” of a polka or a march.',
    count: '1 & 2 &',
    beat: 'quarter',
    bpm: 104,
    minBpm: 50,
    maxBpm: 200,
    spec: {
      time: [2, 4],
      grid: 2,
      repeat: true,
      bars: [
        { sn: '-x-x', bd: 'x-x-' },
        { sn: '-x-x', bd: 'x-x-' },
        { sn: '-x-x', bd: 'x-x-' },
        { sn: '-xxx', bd: 'x-x-' },
      ],
    },
  },
  {
    id: '2-2',
    time: [2, 2],
    name: 'Cut time (2/2)',
    style: 'Two-beat',
    kind: 'simple',
    body: 'The half note gets the beat, so there are two big beats per bar. It looks a lot like the 4/4 rock beat, but you feel it in two, with eighths beamed in fours. Common in fast marches, show tunes and country. Also written ¢.',
    count: '1 e & a 2 e & a',
    beat: 'half',
    bpm: 72,
    minBpm: 30,
    maxBpm: 120,
    spec: {
      time: [2, 2],
      grid: 2,
      repeat: true,
      bars: [
        { hh: 'xxxxxxxx', sn: '--x---x-', bd: 'x---x---' },
        { hh: 'xxxxxxxx', sn: '--x---x-', bd: 'x-x-x---' },
      ],
    },
  },
  {
    id: '6-8',
    time: [6, 8],
    name: 'Six-eight',
    style: 'Ballad',
    kind: 'compound',
    body: 'Six eighth notes per bar, felt as two big beats of three: “ONE two three FOUR five six”. The eighths are beamed in threes to show those beats. Slow 6/8 is the classic rock ’n’ roll ballad feel.',
    count: '1 2 3 4 5 6',
    beat: 'dottedQuarter',
    bpm: 46,
    minBpm: 30,
    maxBpm: 100,
    spec: {
      time: [6, 8],
      grid: 2,
      repeat: true,
      bars: [
        { hh: 'xxxxxx', sn: '---x--', bd: 'x-----' },
        { hh: 'xxxxxx', sn: '---x--', bd: 'x----x' },
      ],
    },
  },
  {
    id: '12-8',
    time: [12, 8],
    name: 'Twelve-eight',
    style: 'Slow blues',
    kind: 'compound',
    body: 'Four dotted-quarter beats per bar, each split into three eighths: “1 & a 2 & a 3 & a 4 & a”. That rolling triplet feel drives slow blues, doo-wop and gospel. The snare still lands on 2 and 4.',
    count: '1 & a 2 & a 3 & a 4 & a',
    beat: 'dottedQuarter',
    bpm: 60,
    minBpm: 30,
    maxBpm: 100,
    spec: {
      time: [12, 8],
      grid: 2,
      repeat: true,
      bars: [
        { hh: 'xxxxxxxxxxxx', sn: '---x-----x--', bd: 'x----xx-----' },
        { hh: 'xxxxxxxxxxxx', sn: '---x-----x--', bd: 'x-x--xx-----' },
      ],
    },
  },
  {
    id: '5-4',
    time: [5, 4],
    name: 'Five-four',
    style: 'Odd groove, 3 + 2',
    kind: 'odd',
    advanced: true,
    body: 'Five quarter-note beats, felt as 3 + 2. The kick marks the start of each part (beats 1 and 4) and the snare lands on 3 and 5, the lopsided swing made famous by “Take Five”.',
    count: '1 & 2 & 3 & 4 & 5 &',
    beat: 'quarter',
    bpm: 140,
    minBpm: 60,
    maxBpm: 220,
    spec: {
      time: [5, 4],
      grid: 2,
      repeat: true,
      bars: [
        { hh: 'xxxxxxxxxx', sn: '----x---x-', bd: 'x-----x---' },
        { hh: 'xxxxxxxxxx', sn: '----x---x-', bd: 'x----xx---' },
      ],
    },
  },
  {
    id: '7-8',
    time: [7, 8],
    name: 'Seven-eight',
    style: 'Odd groove, 2 + 2 + 3',
    kind: 'odd',
    advanced: true,
    body: 'Seven eighth notes grouped 2 + 2 + 3: short, short, long. The beams and the hi-hat accents show the groups. Count every eighth and lean on 1, 3 and 5.',
    count: '1 2 3 4 5 6 7',
    beat: 'eighth',
    bpm: 220,
    minBpm: 100,
    maxBpm: 320,
    spec: {
      time: [7, 8],
      grouping: [2, 2, 3],
      grid: 2,
      repeat: true,
      bars: [
        { hh: 'XxXxXxx', sn: '--x--x-', bd: 'x---x--' },
        { hh: 'XxXxXxx', sn: '--x--x-', bd: 'x---xx-' },
      ],
    },
  },
];
