import type { ScoreSpec } from '../notation/model';

export interface Lesson {
  id: string;
  title: string;
  /** Short badge shown on the card, e.g. "1 & 2 &". */
  tag?: string;
  /** SMuFL glyph(s) shown as the card badge. */
  glyph?: string;
  body: string;
  tip?: string;
  bpm: number;
  spec: ScoreSpec;
}

export const RHYTHM_LESSONS: Lesson[] = [
  {
    id: 'quarters',
    title: 'Quarter notes',
    tag: '1 2 3 4',
    body: 'One note per beat. In 4/4 time there are four beats in every measure — count them out loud: “1, 2, 3, 4”.',
    bpm: 80,
    spec: { grid: 1, bars: [{ sn: 'xxxx' }] },
  },
  {
    id: 'eighths',
    title: 'Eighth notes',
    tag: '1 & 2 &',
    body: 'Two notes per beat. Each pair is joined by a single beam. Say “and” between the numbers: “1 & 2 & 3 & 4 &”.',
    bpm: 80,
    spec: { grid: 2, bars: [{ sn: 'xxxxxxxx' }] },
  },
  {
    id: 'sixteenths',
    title: 'Sixteenth notes',
    tag: '1 e & a',
    body: 'Four notes per beat, joined by a double beam. Count “1 e & a, 2 e & a…” — pronounced “one-ee-and-uh”.',
    bpm: 70,
    spec: { bars: [{ sn: 'xxxxxxxxxxxxxxxx' }] },
  },
  {
    id: 'eighth-two-sixteenths',
    title: 'Eighth + two sixteenths',
    tag: '1 & a',
    body: 'A very common figure: an eighth note followed by two sixteenths. The double beam only covers the last two notes.',
    bpm: 72,
    spec: { bars: [{ sn: 'x-xxx-xxx-xxx-xx' }] },
  },
  {
    id: 'two-sixteenths-eighth',
    title: 'Two sixteenths + eighth',
    tag: '1 e &',
    body: 'The mirror image: two quick sixteenths, then an eighth note on the “&”.',
    bpm: 72,
    spec: { bars: [{ sn: 'xxx-xxx-xxx-xxx-' }] },
  },
  {
    id: 'dotted',
    title: 'Dotted eighth + sixteenth',
    tag: '1 a',
    body: 'A dot adds half the note’s value. A dotted eighth lasts three sixteenths, leaving room for one sixteenth on the “a”. The short stub beam is called a beamlet.',
    bpm: 72,
    spec: { bars: [{ sn: 'x--xx--xx--xx--x' }] },
  },
  {
    id: 'quarter-rests',
    title: 'Quarter rests',
    tag: 'rest',
    body: 'Rests are silence with a length. This squiggle lasts one full beat — keep counting even when you don’t play.',
    bpm: 80,
    spec: { grid: 1, bars: [{ sn: 'x-x-' }, { sn: '-x-x' }] },
  },
  {
    id: 'offbeats',
    title: 'Off-beat eighths',
    tag: '&',
    body: 'An eighth rest followed by an eighth note puts the hit on the “&”. Off-beats are the secret ingredient of groove.',
    bpm: 80,
    spec: { grid: 2, bars: [{ sn: '-x-x-x-x' }] },
  },
  {
    id: 'syncopation',
    title: 'Sixteenth syncopation',
    tag: 'e · a',
    body: 'Sixteenth rests let you land on the “e” and “a” of the beat. Count every sixteenth carefully and play only the written ones.',
    bpm: 66,
    spec: { bars: [{ sn: '-x-x-xx-x--xx-x-' }] },
  },
];

export const TECHNIQUE_GROUPS: { title: string; blurb: string; items: Lesson[] }[] = [
  {
    title: 'Dynamics',
    blurb: 'How loud or soft each note is played.',
    items: [
      {
        id: 'accent',
        title: 'Accent',
        glyph: '\uE4A0',
        body: 'The wedge above the note means play it louder than the notes around it. Accents shape a pattern and give it personality.',
        tip: 'Lift the stick higher for accented notes; keep the others low.',
        bpm: 90,
        spec: { grid: 2, bars: [{ sn: 'XxxxXxxx' }] },
      },
      {
        id: 'marcato',
        title: 'Marcato (heavy accent)',
        glyph: '\uE4AC',
        body: 'The “housetop” accent is even stronger and more pointed than a regular accent — a short, hard, punchy stroke.',
        tip: 'Often used for big ensemble hits together with the crash.',
        bpm: 90,
        spec: { grid: 2, bars: [{ sn: '^xxx^x^x' }] },
      },
      {
        id: 'ghost',
        title: 'Ghost note',
        glyph: '\uE0F5\uE0A4\uE0F6',
        body: 'A note in parentheses is a ghost note — played very softly, felt more than heard. Ghost notes are the glue of funk and R&B grooves.',
        tip: 'Let the stick drop from just an inch above the head.',
        bpm: 80,
        spec: { bars: [{ sn: 'Xgggx-ggXgggx-gg' }] },
      },
    ],
  },
  {
    title: 'Snare sounds',
    blurb: 'Different ways to strike the snare drum.',
    items: [
      {
        id: 'rimshot',
        title: 'Rimshot',
        glyph: '\uE0CF',
        body: 'A notehead with a slash through it: hit the head and the rim at the same time for a loud, cutting crack.',
        tip: 'The stick lands across the rim and the head simultaneously.',
        bpm: 90,
        spec: { grid: 2, bars: [{ sn: '--r---r-', hh: 'xxxxxxxx', bd: 'x---x-x-' }] },
      },
      {
        id: 'cross-stick',
        title: 'Cross-stick',
        glyph: '\uE0A9',
        body: 'An x in the snare space: lay the stick across the drum and click the rim with the butt end. A woody sound used in ballads and Latin styles.',
        tip: 'Keep the tip of the stick resting on the drum head.',
        bpm: 80,
        spec: { grid: 2, bars: [{ sn: '--c---c-', hh: 'xxxxxxxx', bd: 'x---x---' }] },
      },
    ],
  },
  {
    title: 'Grace notes & rolls',
    blurb: 'Ornaments and sustained sounds.',
    items: [
      {
        id: 'flam',
        title: 'Flam',
        glyph: '\uE560',
        body: 'A small slashed grace note right before the main note. Play the grace note softly with one hand just before the main note with the other — “fla-AM”.',
        tip: 'Low stick for the grace note, high stick for the main note.',
        bpm: 80,
        spec: { grid: 1, bars: [{ sn: 'ffff' }] },
      },
      {
        id: 'drag',
        title: 'Drag (ruff)',
        glyph: '\uE560\uE560',
        body: 'Two small grace notes before the main note. Play them as a quick, soft double bounce leading into the main stroke.',
        tip: 'Let the stick bounce: “diddle-STROKE”.',
        bpm: 76,
        spec: { grid: 1, bars: [{ sn: 'dxdx' }] },
      },
      {
        id: 'buzz',
        title: 'Buzz roll',
        glyph: '\uE22A',
        body: 'A “z” through the stem means press the stick into the head so it buzzes for the full length of the note.',
        tip: 'Alternate hands with pressed strokes for a smooth sustained roll.',
        bpm: 70,
        spec: { grid: 1, bars: [{ sn: 'zzzx' }] },
      },
      {
        id: 'roll',
        title: 'Single-stroke roll',
        glyph: '\uE222',
        body: 'Three slashes through the stem mean subdivide the note into rapid strokes (thirty-second notes) for its full length.',
        tip: 'Alternate R L R L evenly.',
        bpm: 66,
        spec: { grid: 2, bars: [{ sn: 'R-R-RRx-' }] },
      },
    ],
  },
  {
    title: 'Cymbals & hi-hat',
    blurb: 'Shaping the sound of the metal.',
    items: [
      {
        id: 'open-hat',
        title: 'Open hi-hat',
        glyph: '\uE5E7',
        body: 'A small circle above a hi-hat note means let the cymbals open so they ring. The next closed note (or the foot) shuts them.',
        tip: 'Ease off the pedal just as you strike, then press back down.',
        bpm: 92,
        spec: { grid: 2, bars: [{ hh: 'xxxoxxxo', sn: '--x---x-', bd: 'x---x---' }] },
      },
      {
        id: 'closed-hat',
        title: 'Closed hi-hat',
        glyph: '\uE5E5',
        body: 'A plus sign means play the hi-hat tightly closed. It’s mostly used right after an open note to make the contrast clear.',
        tip: 'Keep firm pressure on the pedal.',
        bpm: 92,
        spec: { grid: 2, bars: [{ hh: 'o+o+o+o+', bd: 'x---x---' }] },
      },
      {
        id: 'half-open',
        title: 'Half-open hi-hat',
        glyph: '\uE5E6',
        body: 'A circle with a line through it (half open, half closed): let the hi-hat cymbals sit just slightly apart for a sizzling, trashy wash.',
        tip: 'Rest your foot lightly on the pedal.',
        bpm: 96,
        spec: { grid: 2, bars: [{ hh: 'hhhhhhhh', sn: '--x---x-', bd: 'x---x---' }] },
      },
      {
        id: 'foot-hat',
        title: 'Hi-hat with foot',
        glyph: '\uE0A9',
        body: 'An x below the staff with a downward stem: close the hi-hat with your left foot for a crisp “chick”.',
        tip: 'Rock heel-to-toe to keep steady quarter notes.',
        bpm: 90,
        spec: { grid: 2, bars: [{ rd: 'xxxxxxxx', hf: '--x---x-', bd: 'x---x---' }] },
      },
      {
        id: 'bell',
        title: 'Ride bell',
        glyph: '\uE0DB',
        body: 'A diamond on the ride line: play the raised bell of the ride with the shoulder of the stick for a clear, piercing ping.',
        tip: 'Great for driving choruses and Latin grooves.',
        bpm: 96,
        spec: { grid: 2, bars: [{ rd: 'bxbxbxbx', sn: '--x---x-', bd: 'x---x---' }] },
      },
      {
        id: 'choke',
        title: 'Cymbal choke',
        glyph: '\uE805',
        body: 'An apostrophe-like mark after a cymbal note means grab the cymbal with your hand right after hitting it, cutting the sound short.',
        tip: 'Strike, then pinch the edge immediately.',
        bpm: 90,
        spec: { grid: 1, bars: [{ cr: 'x-k-', bd: 'x-x-' }] },
      },
    ],
  },
];
