import { playHit } from '../audio/synth';
import { GROOVES } from '../data/grooves';
import { HEADS } from '../notation/glyphs';
import { INSTRUMENTS, type Inst } from '../notation/instruments';
import { parseScore, type Score } from '../notation/model';
import { glyphIcon, h, ICONS, playButton } from '../ui/dom';
import { isActive, playScore, stopPlayback } from '../ui/playback';
import { mountScore } from '../ui/score-view';
import { getLevel, instrumentsFor, levelToggle, onLevelChange } from '../ui/level';
import type { Player } from '../audio/player';

function keyScore(insts: Inst[]): Score {
  return {
    beats: 1,
    beatUnit: 4,
    slots: 4,
    repeat: false,
    measures: insts.map((inst) => ({ hits: new Map([[0, [{ inst, mods: [] }]]]) })),
  };
}

function keyLabels(insts: Inst[]) {
  const labels: Record<string, string> = {};
  insts.forEach((inst, i) => (labels[`${i}:0`] = INSTRUMENTS[inst].short));
  return labels;
}

export function staffView(root: HTMLElement) {
  let insts = instrumentsFor(getLevel());
  let shown: Inst | null = null;

  const info = h('div', { class: 'info-panel', 'aria-live': 'polite' });
  const showInfo = (inst: Inst | null) => {
    shown = inst;
    if (!inst) {
      info.replaceChildren(
        h('div', { class: 'swatch', style: { background: 'var(--paper)' } }, glyphIcon('\uE0A4', 16)),
        h(
          'div',
          {},
          h('h3', {}, 'Tap any note to hear it'),
          h('p', {}, 'Each line and space of the staff is a different part of the drum kit.'),
        ),
      );
      return;
    }
    const d = INSTRUMENTS[inst];
    info.replaceChildren(
      h('div', { class: 'swatch', style: { background: d.color } }, glyphIcon(HEADS[d.head].glyph, 16)),
      h(
        'div',
        {},
        h('h3', {}, d.name, h('span', { class: 'pill' }, d.placement), h('span', { class: 'pill' }, d.limb)),
        h('p', {}, d.description),
      ),
    );
  };
  showInfo(null);

  const paper = h('div', { class: 'paper' });
  let selected: Element | null = null;
  const view = mountScore(
    paper,
    keyScore(insts),
    { timeSig: false, rests: false, barlines: false, colorize: true, labels: keyLabels(insts), hitAreas: true, spacePx: 12 },
    () => (selected = null),
  );
  paper.addEventListener('click', (e) => {
    const col = (e.target as Element).closest('.col');
    if (!col) return;
    const inst = col.getAttribute('data-inst')?.split(' ')[0] as Inst | undefined;
    if (!inst) return;
    selected?.classList.remove('selected');
    col.classList.add('selected');
    selected = col;
    stopPlayback();
    playHit({ inst, mods: [] });
    showInfo(inst);
  });

  const legend = h('div', { class: 'legend' });
  const fillLegend = () =>
    legend.replaceChildren(
      ...insts.map((id) => h('span', {}, h('i', { style: { background: INSTRUMENTS[id].color } }), INSTRUMENTS[id].short)),
    );
  fillLegend();

  const keyCard = h('article', { class: 'card key-card' });
  onLevelChange(keyCard, (level) => {
    insts = instrumentsFor(level);
    view.update(keyScore(insts), { labels: keyLabels(insts) });
    fillLegend();
    if (shown && !insts.includes(shown)) showInfo(null);
  });

  const explainers = h(
    'div',
    { class: 'explainers' },
    explainer(
      h('div', { class: 'art' }, glyphIcon('\uE069', 14)),
      'The percussion clef',
      'Two thick bars mean the staff is unpitched. Lines and spaces stand for drums and cymbals, not notes of a scale.',
    ),
    explainer(
      h(
        'div',
        { class: 'art' },
        figure('\uE1D5', 'hands'),
        figure('\uE1D6', 'feet'),
      ),
      'Stems: hands up, feet down',
      h(
        'span',
        {},
        'Drum music is usually written in two voices. Sticks get stems pointing up; feet point down, like the bass drum',
        h('span', { class: 'advanced-only' }, ' and hi-hat pedal'),
        '.',
      ),
    ),
    explainer(
      h(
        'div',
        { class: 'art' },
        figure('\uE0A4', 'drums'),
        figure('\uE0A9', 'cymbals'),
        figure('\uE0DB', 'bell', 'advanced-only'),
        figure('\uE0BE', 'cowbell', 'advanced-only'),
      ),
      'Noteheads tell the sound',
      h(
        'span',
        {},
        'Round noteheads are drums. An x means a cymbal.',
        h('span', { class: 'advanced-only' }, ' Special shapes mark special sounds like the ride bell and cowbell.'),
      ),
    ),
    explainer(
      h('div', { class: 'art' }, h('span', { class: 'stack' }, glyphIcon('\uE084', 13), glyphIcon('\uE084', 13))),
      'Time signature',
      '4/4 means four beats per measure, with the quarter note getting one beat. Barlines divide the music into measures.',
    ),
  );

  // "Putting it together" example
  const rock = GROOVES[0];
  const rockScore = parseScore(rock.spec);
  const rockPaper = h('div', { class: 'paper' });
  let player: Player | null = null;
  const { btn, set } = playButton(rock.title, () => {
    if (isActive(player)) return stopPlayback();
    player = playScore(rockScore, rockView, { bpm: rock.bpm, loop: true, onStateChange: set });
  });
  const rockView = mountScore(rockPaper, rockScore, { colorize: true, counts: true, spacePx: 11 });

  keyCard.append(
    h('div', { class: 'card-head' }, h('h2', {}, 'The drum key'), levelToggle()),
    h(
      'p',
      {},
      'Low drums sit low on the staff, cymbals sit on top. Notes are colored by instrument. ',
      h('span', { class: 'basic-only' }, 'Basic shows a standard kit; switch to Advanced for the hi-hat pedal, ride bell, china and cowbell.'),
      h('span', { class: 'advanced-only' }, 'Advanced adds the hi-hat pedal, ride bell, china and cowbell to the standard kit.'),
    ),
    paper,
    h('div', { class: 'key-hint', html: `${ICONS.speaker.replace('<svg', '<svg width="18" height="18"')} Tap a note to play it` }),
    legend,
    info,
  );

  root.append(
    h(
      'section',
      { class: 'hero' },
      h('span', { class: 'eyebrow' }, 'Lesson 1'),
      h('h1', {}, 'Read the drum staff'),
      h(
        'p',
        { class: 'lead' },
        'Drum music uses the familiar five-line staff, but instead of pitches each position is a piece of the kit. Learn where every drum and cymbal lives — tap a note to hear it.',
      ),
    ),
    keyCard,
    h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('div', {}, h('h2', {}, 'How it works'), h('p', {}, 'Four ideas unlock any drum chart.'))),
      explainers,
    ),
    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'section-head' },
        h('div', {}, h('h2', {}, 'Putting it together'), h('p', {}, 'Hi-hat, snare and bass drum stacked into a basic rock beat.')),
      ),
      h(
        'article',
        { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', {}, rock.title)),
        h('p', {}, rock.body),
        rockPaper,
        h(
          'div',
          { class: 'card-foot' },
          btn,
          h('span', { class: 'meta' }, `${rock.bpm} bpm`),
          h('a', { class: 'btn', href: '#/grooves', style: { marginLeft: 'auto' } }, 'More grooves →'),
        ),
      ),
    ),
  );
}

function figure(glyph: string, caption: string, className?: string) {
  return h('figure', { class: className }, glyphIcon(glyph, 11), h('figcaption', {}, caption));
}

function explainer(art: HTMLElement, title: string, body: string | HTMLElement) {
  return h('article', { class: 'card explainer' }, art, h('h3', {}, title), h('p', {}, body));
}
