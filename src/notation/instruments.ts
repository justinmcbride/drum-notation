import type { HeadKind } from './glyphs';

export type Inst =
  | 'crash'
  | 'china'
  | 'hihat'
  | 'ride'
  | 'rideBell'
  | 'cowbell'
  | 'tom1'
  | 'tom2'
  | 'snare'
  | 'floorTom'
  | 'kick'
  | 'hihatFoot';

export type Voice = 'up' | 'down';

export interface InstrumentInfo {
  id: Inst;
  name: string;
  short: string;
  /** Staff position: 0 = bottom line, 8 = top line, odd numbers are spaces. */
  pos: number;
  head: HeadKind;
  voice: Voice;
  limb: string;
  placement: string;
  color: string;
  description: string;
}

export const INSTRUMENTS: Record<Inst, InstrumentInfo> = {
  crash: {
    id: 'crash',
    name: 'Crash Cymbal',
    short: 'Crash',
    pos: 10,
    head: 'x',
    voice: 'up',
    limb: 'Hand',
    placement: 'Ledger line above the staff (A)',
    color: '#f2b134',
    description:
      'A big, explosive cymbal used to mark the start of a phrase or punctuate a fill. Written as an x on its own ledger line above the staff.',
  },
  china: {
    id: 'china',
    name: 'China Cymbal',
    short: 'China',
    pos: 11,
    head: 'circleX',
    voice: 'up',
    limb: 'Hand',
    placement: 'Space above the crash ledger line (B)',
    color: '#e8773a',
    description:
      'A trashy, effects cymbal with an upturned edge. Often written as a circled x above the crash. Placement varies more between publishers than most kit pieces.',
  },
  hihat: {
    id: 'hihat',
    name: 'Hi-Hat (stick)',
    short: 'Hi-Hat',
    pos: 9,
    head: 'x',
    voice: 'up',
    limb: 'Hand',
    placement: 'Space above the staff (G)',
    color: '#5cc8ff',
    description:
      'Two cymbals on a stand, played with sticks. The x in the space above the staff is the time-keeper in most grooves. Add “o” for open and “+” for closed.',
  },
  ride: {
    id: 'ride',
    name: 'Ride Cymbal',
    short: 'Ride',
    pos: 8,
    head: 'x',
    voice: 'up',
    limb: 'Hand',
    placement: 'Top line (F)',
    color: '#7cdba5',
    description:
      'A large cymbal for steady time-keeping with a washy “ping”. Written as an x on the top line of the staff.',
  },
  rideBell: {
    id: 'rideBell',
    name: 'Ride Bell',
    short: 'Bell',
    pos: 8,
    head: 'diamond',
    voice: 'up',
    limb: 'Hand',
    placement: 'Top line, diamond notehead (F)',
    color: '#3fbf8f',
    description:
      'The raised dome in the middle of the ride. It cuts through with a clear, bell-like tone and is shown with a diamond notehead on the ride line.',
  },
  cowbell: {
    id: 'cowbell',
    name: 'Cowbell',
    short: 'Cowbell',
    pos: 7,
    head: 'triangle',
    voice: 'up',
    limb: 'Hand',
    placement: 'Top space, triangle notehead (E)',
    color: '#c79bff',
    description:
      'An auxiliary percussion bell mounted on the kit. Usually written with a triangle notehead; its exact placement varies by publisher.',
  },
  tom1: {
    id: 'tom1',
    name: 'High Tom',
    short: 'Tom 1',
    pos: 7,
    head: 'black',
    voice: 'up',
    limb: 'Hand',
    placement: 'Top space (E)',
    color: '#ff8fab',
    description:
      'The smallest, highest-pitched rack tom. Toms are written with normal noteheads — the higher the drum, the higher on the staff.',
  },
  tom2: {
    id: 'tom2',
    name: 'Mid Tom',
    short: 'Tom 2',
    pos: 6,
    head: 'black',
    voice: 'up',
    limb: 'Hand',
    placement: 'Fourth line (D)',
    color: '#ff6f91',
    description: 'The second rack tom, a little lower than the high tom. Written on the fourth line.',
  },
  snare: {
    id: 'snare',
    name: 'Snare Drum',
    short: 'Snare',
    pos: 5,
    head: 'black',
    voice: 'up',
    limb: 'Hand',
    placement: 'Third space (C)',
    color: '#ff6b4a',
    description:
      'The crisp, cracking backbeat of almost every groove. It lives in the third space — the one just above the middle line.',
  },
  floorTom: {
    id: 'floorTom',
    name: 'Floor Tom',
    short: 'Floor',
    pos: 3,
    head: 'black',
    voice: 'up',
    limb: 'Hand',
    placement: 'Second space (A)',
    color: '#e0559a',
    description: 'The big, low tom that stands on the floor. Written in the second space from the bottom.',
  },
  kick: {
    id: 'kick',
    name: 'Bass Drum',
    short: 'Kick',
    pos: 1,
    head: 'black',
    voice: 'down',
    limb: 'Right foot',
    placement: 'Bottom space (F)',
    color: '#9d8cff',
    description:
      'The kick drum, played with the right foot pedal. Written in the bottom space with stems pointing down — feet live in the lower voice.',
  },
  hihatFoot: {
    id: 'hihatFoot',
    name: 'Hi-Hat (foot)',
    short: 'HH Foot',
    pos: -1,
    head: 'x',
    voice: 'down',
    limb: 'Left foot',
    placement: 'Space below the staff (D)',
    color: '#4fa3d9',
    description:
      'Closing the hi-hat with the left-foot pedal makes a short “chick”. Written as an x just below the staff with a downward stem.',
  },
};

/** Order for the drum key, bottom of staff to top. */
export const KEY_ORDER: Inst[] = [
  'hihatFoot',
  'kick',
  'floorTom',
  'snare',
  'tom2',
  'tom1',
  'ride',
  'rideBell',
  'hihat',
  'crash',
  'china',
  'cowbell',
];
