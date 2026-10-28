import type { Player } from '../audio/player';
import { GROOVES, type Groove } from '../data/grooves';
import { parseScore } from '../notation/model';
import { h, playButton } from '../ui/dom';
import { isActive, playScore, stopPlayback } from '../ui/playback';
import { mountScore } from '../ui/score-view';

const prefs = {
  loop: true,
  metronome: false,
  counts: true,
  colorize: false,
};

function toggle(label: string, key: keyof typeof prefs, onChange: (v: boolean) => void) {
  const btn = h('button', { class: 'toggle', type: 'button', 'aria-pressed': String(prefs[key]) }, label);
  btn.addEventListener('click', () => {
    prefs[key] = !prefs[key];
    btn.setAttribute('aria-pressed', String(prefs[key]));
    onChange(prefs[key]);
  });
  return btn;
}

export function groovesView(root: HTMLElement, param?: string) {
  const groove: Groove = GROOVES.find((g) => g.id === param) ?? GROOVES[0];
  const score = parseScore(groove.spec);
  let bpm = groove.bpm;
  let player: Player | null = null;

  const paper = h('div', { class: 'paper' });
  const view = mountScore(paper, score, { counts: prefs.counts, colorize: prefs.colorize, spacePx: 11, minScale: 0.95 });

  const start = () => {
    player = playScore(score, view, { bpm, loop: prefs.loop, metronome: prefs.metronome, onStateChange: set });
  };
  const { btn, set } = playButton(groove.title, () => (isActive(player) ? stopPlayback() : start()));
  btn.classList.add('large');

  const output = h('output', {});
  const range = h('input', { type: 'range', min: 40, max: 200, step: 1, value: bpm, 'aria-label': 'Tempo' });
  const setBpm = (v: number) => {
    bpm = Math.max(40, Math.min(200, Math.round(v)));
    range.value = String(bpm);
    output.innerHTML = `${bpm} <small>bpm</small>`;
    if (player) player.opts.bpm = bpm;
  };
  range.addEventListener('input', () => setBpm(+range.value));
  setBpm(bpm);

  const chips = h(
    'div',
    { class: 'chips', role: 'tablist' },
    GROOVES.map((g) =>
      h(
        'a',
        { class: `chip${g.id === groove.id ? ' active' : ''}`, href: `#/grooves/${g.id}`, role: 'tab', 'aria-selected': String(g.id === groove.id) },
        g.title,
      ),
    ),
  );

  root.append(
    h(
      'section',
      { class: 'hero' },
      h('span', { class: 'eyebrow' }, 'Practice'),
      h('h1', {}, 'Grooves'),
      h(
        'p',
        { class: 'lead' },
        'Classic beats written out in full. Press play to hear them and follow the highlighted notes. Slow the tempo down until you can read every hit.',
      ),
    ),
    chips,
    h(
      'article',
      { class: 'card groove-card' },
      h('div', { class: 'card-head' }, h('h2', {}, groove.title)),
      h(
        'div',
        { class: 'groove-meta' },
        h('span', { class: 'pill' }, groove.style),
        h(
          'span',
          { class: 'pill', title: `Difficulty ${groove.level} of 3` },
          'Level',
          h('span', { class: 'level' }, [1, 2, 3].map((i) => h('i', { class: i <= groove.level ? 'on' : '' }))),
        ),
      ),
      h('p', {}, groove.body),
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
      h(
        'div',
        { class: 'toggles' },
        toggle('Loop', 'loop', (v) => {
          if (player) player.opts.loop = v;
        }),
        toggle('Metronome', 'metronome', (v) => {
          if (player) player.opts.metronome = v;
        }),
        toggle('Counts', 'counts', (v) => view.update(undefined, { counts: v })),
        toggle('Color by drum', 'colorize', (v) => view.update(undefined, { colorize: v })),
      ),
    ),
  );

  requestAnimationFrame(() => chips.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
}
