import { TECHNIQUE_GROUPS } from '../data/lessons';
import { glyphIcon, h } from '../ui/dom';
import { lessonCard } from '../ui/lesson-card';

export function hitsView(root: HTMLElement, param?: string) {
  root.append(
    h(
      'section',
      { class: 'hero' },
      h('span', { class: 'eyebrow' }, 'Lesson 3'),
      h('h1', {}, 'Every kind of hit'),
      h(
        'p',
        { class: 'lead' },
        'Small symbols around a note change how you play it — louder, softer, with a grace note, buzzed, open or choked. Here is the full vocabulary, each with an example you can hear.',
      ),
      h(
        'div',
        { class: 'chips', style: { marginTop: '18px' } },
        TECHNIQUE_GROUPS.flatMap((g) => g.items).map((t) =>
          h('a', { class: 'chip', href: `#/hits/${t.id}` }, t.glyph ? glyphIcon(t.glyph, 5) : null, t.title),
        ),
      ),
    ),
    ...TECHNIQUE_GROUPS.map((group) =>
      h(
        'section',
        { class: 'section' },
        h('div', { class: 'section-head' }, h('div', {}, h('h2', {}, group.title), h('p', {}, group.blurb))),
        h('div', { class: 'grid wide' }, group.items.map((l) => lessonCard(l, { counts: false }))),
      ),
    ),
  );
  if (param) {
    requestAnimationFrame(() => document.getElementById(param)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}
