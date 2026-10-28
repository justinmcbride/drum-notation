import { RHYTHM_LESSONS } from '../data/lessons';
import { h, staffGlyph } from '../ui/dom';
import { lessonCard } from '../ui/lesson-card';

// [name, note glyph, rest glyph, rest staff position, beats]
const VALUES: [string, string, string, number, string][] = [
  ['Whole', '\uE1D2', '\uE4E3', 6, '4 beats'],
  ['Half', '\uE1D3', '\uE4E4', 4, '2 beats'],
  ['Quarter', '\uE1D5', '\uE4E5', 4, '1 beat'],
  ['Eighth', '\uE1D7', '\uE4E6', 4, '½ beat'],
  ['Sixteenth', '\uE1D9', '\uE4E7', 4, '¼ beat'],
];

export function rhythmView(root: HTMLElement) {
  const table = h(
    'table',
    { class: 'values' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Note'), h('th', {}, 'Rest'), h('th', {}, 'Name'), h('th', {}, 'In 4/4'))),
    h(
      'tbody',
      {},
      VALUES.map(([name, note, rest, restPos, beats]) =>
        h(
          'tr',
          {},
          h('td', { class: 'g' }, h('span', {}, staffGlyph(note, 3))),
          h('td', { class: 'g' }, h('span', {}, staffGlyph(rest, restPos))),
          h('td', {}, h('strong', {}, name)),
          h('td', { class: 'beats' }, beats),
        ),
      ),
    ),
  );

  root.append(
    h(
      'section',
      { class: 'hero' },
      h('span', { class: 'eyebrow' }, 'Lesson 2'),
      h('h1', {}, 'Count the rhythm'),
      h(
        'p',
        { class: 'lead' },
        'Where a note sits on the staff tells you what to hit. Its shape — stems, flags and beams — tells you when. Press play and count along; the metronome clicks every beat.',
      ),
    ),
    h(
      'article',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Note values')),
      h('p', {}, 'Each note has a matching rest of the same length. Every extra flag or beam halves the length.'),
      h('div', { style: { overflowX: 'auto', marginTop: '10px' } }, table),
    ),
    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'section-head' },
        h('div', {}, h('h2', {}, 'Counting exercises'), h('p', {}, 'Highlighted counts show where each note falls in the beat.')),
      ),
      h(
        'div',
        { class: 'grid wide' },
        RHYTHM_LESSONS.map((l) => lessonCard(l, { counts: true, metronome: true })),
      ),
    ),
  );
}
