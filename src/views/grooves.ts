import type { Player } from '../audio/player';
import { GROOVES, type Groove } from '../data/grooves';
import { parseScore } from '../notation/model';
import { h, playButton } from '../ui/dom';
import { isActive, playScore, stopPlayback } from '../ui/playback';
import { mountScore, type ScoreView } from '../ui/score-view';

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

const findGroove = (id?: string): Groove => GROOVES.find((g) => g.id === id) ?? GROOVES[0];

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Builds the card for one groove. The score is mounted by the caller once the card is in the document. */
function grooveCard(groove: Groove) {
  const score = parseScore(groove.spec);
  let bpm = groove.bpm;
  let player: Player | null = null;
  let view: ScoreView | null = null;

  const paper = h('div', { class: 'paper' });

  const start = () => {
    if (!view) return;
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

  const card = h(
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
      toggle('Counts', 'counts', (v) => view?.update(undefined, { counts: v })),
      toggle('Color by drum', 'colorize', (v) => view?.update(undefined, { colorize: v })),
    ),
  );

  const mount = () => {
    view = mountScore(paper, score, { counts: prefs.counts, colorize: prefs.colorize, spacePx: 11, minScale: 0.95 });
  };
  const destroy = () => view?.destroy();
  return { card, paper, mount, destroy };
}

export function groovesView(root: HTMLElement, param?: string) {
  let groove = findGroove(param);

  const chipLinks = new Map<string, HTMLAnchorElement>();
  const chips = h(
    'div',
    { class: 'chips', role: 'tablist' },
    GROOVES.map((g) => {
      const a = h('a', { class: 'chip', href: `#/grooves/${g.id}`, role: 'tab' }, g.title);
      chipLinks.set(g.id, a);
      return a;
    }),
  );
  const markActive = () => {
    for (const [id, a] of chipLinks) {
      a.classList.toggle('active', id === groove.id);
      a.setAttribute('aria-selected', String(id === groove.id));
    }
  };
  /** Brings the active chip into the horizontal strip without moving the page vertically. */
  const revealChip = (smooth: boolean) => {
    const a = chipLinks.get(groove.id);
    if (!a || chips.scrollWidth <= chips.clientWidth) return;
    const left = a.offsetLeft - (chips.clientWidth - a.offsetWidth) / 2;
    chips.scrollTo({ left, behavior: smooth && !reducedMotion() ? 'smooth' : 'instant' });
  };

  let current = grooveCard(groove);
  markActive();
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
    current.card,
  );
  current.mount();
  requestAnimationFrame(() => revealChip(false));

  return (nextParam?: string) => {
    const next = findGroove(nextParam);
    if (next.id === groove.id) return;
    groove = next;
    markActive();
    revealChip(true);

    // Swap only the card, holding the page height so the scroll position never jumps.
    const y = window.scrollY;
    root.style.minHeight = `${root.offsetHeight}px`;
    const prev = current;
    current = grooveCard(groove);
    prev.card.replaceWith(current.card);
    prev.destroy();
    current.mount();
    root.style.removeProperty('min-height');
    if (window.scrollY !== y) window.scrollTo({ top: y, behavior: 'instant' });

    // If the new score is off-screen, bring it in gently.
    const r = current.paper.getBoundingClientRect();
    const tabBar = document.querySelector('.tabs');
    const bottomBar = tabBar && getComputedStyle(tabBar).position === 'fixed' ? tabBar.getBoundingClientRect().height : 0;
    const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
    if (r.top < top || r.bottom > window.innerHeight - bottomBar) {
      current.paper.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'instant' : 'smooth' });
    }
  };
}
