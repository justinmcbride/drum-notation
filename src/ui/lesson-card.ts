import type { Lesson } from '../data/lessons';
import { parseScore, type Score } from '../notation/model';
import { glyphIcon, h, playButton } from './dom';
import { playScore, stopPlayback, isActive } from './playback';
import { mountScore } from './score-view';
import type { Player } from '../audio/player';

export interface LessonCardOptions {
  counts?: boolean;
  metronome?: boolean;
}

export function lessonCard(lesson: Lesson, options: LessonCardOptions = {}) {
  const score = parseScore(lesson.spec);
  const paper = h('div', { class: 'paper' });
  let player: Player | null = null;

  const badge = lesson.glyph
    ? h('span', { class: 'badge glyph', 'aria-hidden': 'true' }, glyphIcon(lesson.glyph, 9))
    : lesson.tag
      ? h('span', { class: 'badge count-tag' }, lesson.tag)
      : null;

  const { btn, set } = playButton(lesson.title, () => {
    if (isActive(player)) {
      stopPlayback();
      return;
    }
    player = playScore(score, view, {
      bpm: lesson.bpm,
      loop: true,
      metronome: options.metronome,
      onStateChange: set,
    });
  });

  const card = h(
    'article',
    { class: 'card lesson' + (isDense(score) ? ' wide' : ''), id: lesson.id },
    h('div', { class: 'card-head' }, h('h3', {}, lesson.title), badge),
    h('p', {}, lesson.body),
    lesson.tip ? h('p', { class: 'tip' }, lesson.tip) : null,
    paper,
    h('div', { class: 'card-foot' }, btn, h('span', { class: 'meta' }, `${lesson.bpm} bpm · loops until stopped`)),
  );

  const view = mountScore(paper, score, {
    counts: options.counts,
    clef: true,
    timeSig: true,
  });

  return card;
}

/** Scores with many notes get a full-width card so they stay legible. */
function isDense(score: Score) {
  return score.measures.reduce((n, m) => n + m.hits.size, 0) > 12;
}
