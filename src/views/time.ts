import type { Player } from '../audio/player';
import { METER_EXAMPLES, type BeatNote, type MeterExample } from '../data/meters';
import { timeSigDigit } from '../notation/glyphs';
import { parseScore } from '../notation/model';
import { glyphIcon, h, playButton } from '../ui/dom';
import { levelToggle, onLevelChange } from '../ui/level';
import { isActive, playScore, stopPlayback } from '../ui/playback';
import { getKickRests, kickRestsToggle } from '../ui/prefs';
import { mountScore, type ScoreView } from '../ui/score-view';

const NOTE = { half: '\uE1D3', quarter: '\uE1D5', eighth: '\uE1D7' };
const COMMON = '\uE08A';
const CUT = '\uE08B';

const BEAT_GLYPHS: Record<BeatNote, string> = {
  half: NOTE.half,
  quarter: NOTE.quarter,
  dottedQuarter: NOTE.quarter,
  eighth: NOTE.eighth,
};

const BEAT_NAMES: Record<BeatNote, string> = {
  half: 'half notes',
  quarter: 'quarter notes',
  dottedQuarter: 'dotted quarter notes',
  eighth: 'eighth notes',
};

const prefs = { metronome: true };

const digits = (n: number) => [...String(n)].map((d) => timeSigDigit(+d)).join('');

/** A time signature drawn with Bravura's digits, top number over bottom. */
function timeSig([top, bottom]: [number, number], space: number) {
  return h('span', { class: 'ts-stack' }, glyphIcon(digits(top), space), glyphIcon(digits(bottom), space));
}

function figure(art: Element, caption: string) {
  return h('figure', {}, art, h('figcaption', {}, caption));
}

function explainer(art: HTMLElement, title: string, body: string | HTMLElement, className = '') {
  return h('article', { class: `card explainer ${className}`.trim() }, art, h('h3', {}, title), h('p', {}, body));
}

function exampleCard(ex: MeterExample, views: Set<ScoreView>) {
  const score = parseScore(ex.spec);
  let bpm = ex.bpm;
  let player: Player | null = null;
  let view: ScoreView | null = null;
  const paper = h('div', { class: 'paper' });

  const { btn, set } = playButton(`${ex.time.join('/')} ${ex.style}`, () => {
    if (isActive(player)) return stopPlayback();
    if (!view) return;
    player = playScore(score, view, { bpm, loop: true, metronome: prefs.metronome, onStateChange: set });
  });
  btn.classList.add('large');

  const value = h('span', {});
  const output = h(
    'output',
    { 'aria-label': `Tempo in ${BEAT_NAMES[ex.beat]} per minute` },
    h(
      'span',
      { class: 'beat-note', 'aria-hidden': 'true' },
      glyphIcon(BEAT_GLYPHS[ex.beat], 6),
      ex.beat === 'dottedQuarter' ? h('i', { class: 'aug-dot' }) : null,
    ),
    h('small', { 'aria-hidden': 'true' }, '='),
    value,
  );
  const range = h('input', {
    type: 'range',
    min: ex.minBpm,
    max: ex.maxBpm,
    step: 1,
    value: bpm,
    'aria-label': `Tempo (${BEAT_NAMES[ex.beat]} per minute)`,
  });
  const setBpm = (v: number) => {
    bpm = Math.max(ex.minBpm, Math.min(ex.maxBpm, Math.round(v)));
    range.value = String(bpm);
    value.textContent = String(bpm);
    if (player) player.opts.bpm = bpm;
  };
  range.addEventListener('input', () => setBpm(+range.value));
  setBpm(bpm);

  const metronome = h('button', { class: 'toggle', type: 'button', 'aria-pressed': String(prefs.metronome) }, 'Metronome');
  metronome.addEventListener('click', () => {
    prefs.metronome = !prefs.metronome;
    document.querySelectorAll('.meter-card .metronome-toggle').forEach((b) => b.setAttribute('aria-pressed', String(prefs.metronome)));
    if (isActive(player)) player!.opts.metronome = prefs.metronome;
  });
  metronome.classList.add('metronome-toggle');

  const card = h(
    'article',
    { class: `card meter-card${ex.advanced ? ' advanced-only' : ''}`, id: `meter-${ex.id}` },
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'badge ts-badge', role: 'img', 'aria-label': `${ex.time[0]}/${ex.time[1]}` }, timeSig(ex.time, 7)),
      h('div', { class: 'meter-title' }, h('h3', {}, ex.name), h('span', { class: 'pill' }, ex.style)),
    ),
    h('p', {}, ex.body),
    h('p', { class: 'count-line' }, 'Count: ', h('strong', {}, ex.count)),
    paper,
    h(
      'div',
      { class: 'transport' },
      btn,
      h(
        'div',
        { class: 'tempo' },
        h('button', { class: 'step-btn', type: 'button', 'aria-label': 'Slower', onclick: () => setBpm(bpm - 5) }, '−'),
        range,
        h('button', { class: 'step-btn', type: 'button', 'aria-label': 'Faster', onclick: () => setBpm(bpm + 5) }, '+'),
        output,
      ),
    ),
    h('div', { class: 'toggles' }, metronome),
  );

  const mount = () => {
    view = mountScore(paper, score, { counts: true, downRests: getKickRests(), spacePx: 11, minScale: 0.6 });
    views.add(view);
  };
  return { card, mount, playing: () => isActive(player) };
}

export function timeView(root: HTMLElement) {
  const views = new Set<ScoreView>();
  const cards = METER_EXAMPLES.map((ex) => ({ ex, ...exampleCard(ex, views) }));
  const cardsOf = (kind: MeterExample['kind']) => cards.filter((c) => c.ex.kind === kind).map((c) => c.card);

  const kickRests = kickRestsToggle('time-kick-rests-note', (on) => views.forEach((v) => v.update(undefined, { downRests: on })));

  const explainers = h(
    'div',
    { class: 'explainers fit' },
    explainer(
      h('div', { class: 'art' }, timeSig([3, 4], 12)),
      'Two numbers',
      h(
        'span',
        {},
        h('strong', {}, 'Top: '),
        'how many beats are in each bar. ',
        h('strong', {}, 'Bottom: '),
        'which note value gets one beat. So 3/4 means three quarter-note beats per bar.',
      ),
    ),
    explainer(
      h(
        'div',
        { class: 'art' },
        figure(glyphIcon(NOTE.half, 11), '2'),
        figure(glyphIcon(NOTE.quarter, 11), '4'),
        figure(glyphIcon(NOTE.eighth, 11), '8'),
      ),
      'The bottom number',
      'It names a note by how many fit in a whole note: 2 is a half note, 4 is a quarter note and 8 is an eighth note.',
    ),
    explainer(
      h('div', { class: 'art' }, figure(glyphIcon(COMMON, 13), 'common time'), figure(glyphIcon(CUT, 13), 'cut time')),
      'Shorthand symbols',
      'A C in place of the numbers means 4/4 (common time). A C with a line through it means 2/2 (cut time).',
    ),
  );

  const meters = h(
    'div',
    { class: 'explainers fit' },
    explainer(
      h('div', { class: 'art ts-art' }, timeSig([2, 4], 9), timeSig([3, 4], 9), timeSig([4, 4], 9)),
      'Simple meter',
      'Each beat splits into two. Count the beats with numbers and the halves with “&”: “1 & 2 & 3 & 4 &”.',
    ),
    explainer(
      h('div', { class: 'art ts-art' }, timeSig([6, 8], 9), timeSig([9, 8], 9), timeSig([12, 8], 9)),
      'Compound meter',
      'Each beat is a dotted quarter that splits into three eighths, so eighths are beamed in threes. Divide the top number by 3 to find the beats: 6/8 has two, 12/8 has four.',
    ),
    explainer(
      h('div', { class: 'art ts-art' }, timeSig([5, 4], 9), timeSig([7, 8], 9)),
      'Odd meter',
      'Beats that don’t divide evenly are grouped into uneven parts, like 3 + 2 or 2 + 2 + 3. Feel the long and short groups.',
      'advanced-only',
    ),
  );

  const group = (title: string, blurb: string, items: HTMLElement[], className = '') =>
    h(
      'div',
      { class: `meter-group ${className}`.trim() },
      h('h3', {}, title),
      h('p', {}, blurb),
      h('div', { class: 'grid wide' }, items),
    );

  const page = h(
    'div',
    {},
    h(
      'section',
      { class: 'hero' },
      h('span', { class: 'eyebrow' }, 'Lesson 4'),
      h('h1', {}, 'Time signatures'),
      h(
        'p',
        { class: 'lead' },
        'The two numbers at the start of the music tell you how to count it. Learn to read them, then play a groove in each meter and count along with the highlighted numbers.',
      ),
    ),
    h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Reading a time signature')), explainers),
    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'section-head' },
        h(
          'div',
          {},
          h('h2', {}, h('span', { class: 'basic-only' }, 'Simple and compound'), h('span', { class: 'advanced-only' }, 'Simple, compound and odd')),
        ),
        levelToggle(),
      ),
      meters,
      h('p', { class: 'level-hint basic-only' }, 'Switch to Advanced for odd meters like 5/4 and 7/8.'),
    ),
    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'section-head' },
        h(
          'div',
          {},
          h('h2', {}, 'Play along'),
          h('p', {}, 'Each example loops. Count out loud with the highlighted numbers; the metronome clicks the beat.'),
        ),
      ),
      h('div', { class: 'toggles' }, kickRests.btn),
      kickRests.note,
      group('Simple meters', 'Beats split in two. The tempo counts quarter notes, or half notes in cut time.', cardsOf('simple')),
      group('Compound meters', 'Beats split in three. The tempo counts dotted quarters.', cardsOf('compound')),
      group('Odd meters', 'Uneven groups. The tempo counts the note the bottom number names.', cardsOf('odd'), 'advanced-only'),
    ),
  );
  root.append(page);
  cards.forEach((c) => c.mount());

  onLevelChange(page, (level) => {
    if (level === 'basic' && cards.some((c) => c.ex.advanced && c.playing())) stopPlayback();
  });
}
