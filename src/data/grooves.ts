import type { ScoreSpec } from '../notation/model';

export interface Groove {
  id: string;
  title: string;
  style: string;
  level: 1 | 2 | 3;
  bpm: number;
  body: string;
  spec: ScoreSpec;
}

export const GROOVES: Groove[] = [
  {
    id: 'rock',
    title: 'Basic Rock Beat',
    style: 'Rock',
    level: 1,
    bpm: 96,
    body: 'The foundation of modern drumming: eighth notes on the hi-hat, snare on beats 2 and 4, bass drum on 1 and 3.',
    spec: { grid: 2, repeat: true, bars: [{ hh: 'xxxxxxxx', sn: '--x---x-', bd: 'x---x---' }] },
  },
  {
    id: 'rock-and',
    title: 'Rock with “&” Kicks',
    style: 'Rock',
    level: 1,
    bpm: 100,
    body: 'Adding a bass drum on the “& of 3” gives the basic beat forward motion. Bar two adds a kick on the “& of 2”.',
    spec: {
      grid: 2,
      repeat: true,
      bars: [
        { hh: 'xxxxxxxx', sn: '--x---x-', bd: 'x---xx--' },
        { hh: 'xxxxxxxx', sn: '--x---x-', bd: 'x--xxx--' },
      ],
    },
  },
  {
    id: 'sixteenth-hats',
    title: 'Sixteenth-Note Hi-Hats',
    style: 'Pop',
    level: 2,
    bpm: 84,
    body: 'Sixteenth notes on the hi-hat with accents on each beat create a driving pop/funk feel. Keep the unaccented notes light.',
    spec: {
      repeat: true,
      bars: [{ hh: 'XxxxXxxxXxxxXxxx', sn: '----x-------x---', bd: 'x-----x-x-------' }],
    },
  },
  {
    id: 'disco',
    title: 'Four on the Floor',
    style: 'Disco / Dance',
    level: 2,
    bpm: 112,
    body: 'Bass drum on every beat with an open hi-hat on every “&”. The foot closes the hat on the beat for the classic disco “tss”.',
    spec: {
      grid: 2,
      repeat: true,
      bars: [{ hh: '-o-o-o-o', hf: 'x-x-x-x-', sn: '--x---x-', bd: 'x-x-x-x-' }],
    },
  },
  {
    id: 'half-time',
    title: 'Half-Time Groove',
    style: 'Rock / Hip-hop',
    level: 1,
    bpm: 140,
    body: 'The snare moves to beat 3, making the groove feel half as fast as the hi-hat. A rimshot gives the backbeat extra weight.',
    spec: { grid: 2, repeat: true, bars: [{ hh: 'xxxxxxxx', sn: '----r---', bd: 'x-----x-' }] },
  },
  {
    id: 'funk',
    title: 'Funk with Ghost Notes',
    style: 'Funk',
    level: 3,
    bpm: 88,
    body: 'Soft ghost notes between the backbeats give funk its bounce. Play the accented backbeats loud and the ghosts barely audible.',
    spec: {
      repeat: true,
      bars: [
        {
          hh: 'x-x-x-x-x-x-x-x-',
          sn: '---gX--g-g-gX--g',
          bd: 'x-x-------x--x--',
        },
      ],
    },
  },
  {
    id: 'ride-bell',
    title: 'Ride & Bell Groove',
    style: 'Rock',
    level: 2,
    bpm: 104,
    body: 'Crash on the downbeat, then ride with bell accents on the beat. The left foot keeps time on the hi-hat pedal.',
    spec: {
      grid: 2,
      repeat: true,
      bars: [
        { cr: 'x-------', rd: '-xbxbxbx', hf: '--x---x-', sn: '--x---x-', bd: 'x---xx--' },
        { rd: 'bxbxbxbx', hf: '--x---x-', sn: '--x---x-', bd: 'x---xx--' },
      ],
    },
  },
  {
    id: 'bossa',
    title: 'Bossa Nova',
    style: 'Latin',
    level: 3,
    bpm: 120,
    body: 'Cross-stick plays the two-bar bossa clave while the ride flows in eighths. Bass drum plays a gentle dotted pattern; the hi-hat foot marks 2 and 4.',
    spec: {
      grid: 2,
      repeat: true,
      bars: [
        { rd: 'xxxxxxxx', sn: 'c--c--c-', bd: 'x--xx--x', hf: '--x---x-' },
        { rd: 'xxxxxxxx', sn: '--c--c--', bd: 'x--xx--x', hf: '--x---x-' },
      ],
    },
  },
  {
    id: 'tom-fill',
    title: 'Groove + Tom Fill',
    style: 'Rock',
    level: 2,
    bpm: 92,
    body: 'Three bars of groove (with a little pickup into bar 3), then a bar of sixteenth notes around the kit that lands on a crash. Read the fill high-to-low: snare, high tom, mid tom, floor tom.',
    spec: {
      bars: [
        { hh: 'x-x-x-x-x-x-x-x-', sn: '----x-------x---', bd: 'x-------x-x-----' },
        { hh: 'x-x-x-x-x-x-----', sn: '----x-------xx--', bd: 'x-------x-------', t1: '--------------xx' },
        { hh: 'x-x-x-x-x-x-x-x-', sn: '----x-------x---', bd: 'x-------x-x-----' },
        { sn: 'xxxx------------', t1: '----xxxx--------', t2: '--------xxxx----', ft: '------------xxxx', bd: 'x---x---x---x---' },
        { cr: 'x---------------', sn: '----------------', bd: 'x---------------' },
      ],
    },
  },
  {
    id: 'big-finish',
    title: 'The Big Finish',
    style: 'Ending',
    level: 3,
    bpm: 84,
    body: 'An ending phrase that uses many of the techniques: flams, a drag, a buzz roll, accented tom hits, and a final choked crash with a China.',
    spec: {
      bars: [
        { hh: 'x-x-x-x-x-x-x-x-', sn: '----r-------F-d-', bd: 'x-------x-x-----' },
        { sn: 'z---z---F-F-----', t1: '------------X---', ft: '--------------X-', bd: 'x-------x---x-x-' },
        { cr: 'k---------------', ch: '----x-----------', bd: 'x---x-----------' },
      ],
    },
  },
];
