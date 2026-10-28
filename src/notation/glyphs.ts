// SMuFL codepoints and Bravura metrics (in staff spaces, y-up) used by the engraver.
// Source: Bravura font metadata (https://github.com/steinbergmedia/bravura).

export const GLYPH = {
  percussionClef: '\uE069',
  noteheadBlack: '\uE0A4',
  noteheadX: '\uE0A9',
  noteheadCircleX: '\uE0B3',
  noteheadDiamond: '\uE0DB',
  noteheadSlashed: '\uE0CF',
  noteheadTriangle: '\uE0BE',
  parenLeft: '\uE0F5',
  parenRight: '\uE0F6',
  restWhole: '\uE4E3',
  restHalf: '\uE4E4',
  restQuarter: '\uE4E5',
  rest8th: '\uE4E6',
  rest16th: '\uE4E7',
  flag8thUp: '\uE240',
  flag8thDown: '\uE241',
  flag16thUp: '\uE242',
  flag16thDown: '\uE243',
  accentAbove: '\uE4A0',
  accentBelow: '\uE4A1',
  marcatoAbove: '\uE4AC',
  marcatoBelow: '\uE4AD',
  open: '\uE5E7',
  closed: '\uE5E5',
  halfOpen: '\uE5E6',
  buzzRoll: '\uE22A',
  tremolo3: '\uE222',
  graceAcciaccatura: '\uE560',
  choke: '\uE805',
  augmentationDot: '\uE1E7',
} as const;

export const timeSigDigit = (d: number) => String.fromCharCode(0xe080 + d);
export const TIME_DIGIT_ADVANCE = [1.88, 1.336, 1.784, 1.684, 1.88, 1.612, 1.736, 1.764, 1.744, 1.736];

export type HeadKind = 'black' | 'x' | 'circleX' | 'diamond' | 'slashed' | 'triangle';

export interface HeadMetrics {
  glyph: string;
  width: number;
  up: [number, number];
  down: [number, number];
}

export const HEADS: Record<HeadKind, HeadMetrics> = {
  black: { glyph: GLYPH.noteheadBlack, width: 1.18, up: [1.18, 0.168], down: [0, -0.168] },
  x: { glyph: GLYPH.noteheadX, width: 1.16, up: [1.16, 0.444], down: [0, -0.44] },
  circleX: { glyph: GLYPH.noteheadCircleX, width: 0.996, up: [0.996, 0], down: [0, 0] },
  diamond: { glyph: GLYPH.noteheadDiamond, width: 0.98, up: [0.978, 0], down: [0, 0] },
  slashed: { glyph: GLYPH.noteheadSlashed, width: 1.18, up: [1.18, 0.164], down: [0, -0.172] },
  triangle: { glyph: GLYPH.noteheadTriangle, width: 1.172, up: [1.172, -0.5], down: [0, -0.5] },
};

export const ENGRAVING = {
  staffLine: 0.13,
  stem: 0.12,
  beam: 0.5,
  beamSpacing: 0.25,
  ledger: 0.16,
  ledgerExtension: 0.4,
  thinBarline: 0.16,
  thickBarline: 0.5,
  barlineSeparation: 0.4,
};
