import { playHit } from '../audio/synth';
import { TECHNIQUE_GROUPS } from '../data/lessons';
import { INSTRUMENTS, KEY_ORDER, type Inst } from '../notation/instruments';
import { parseScore, type Hit, type Score, type ScoreSpec } from '../notation/model';
import { h, ICONS } from '../ui/dom';
import { mountScore, type ScoreView } from '../ui/score-view';

type Mode = 'drums' | 'hits';

interface Question {
  score: Score;
  prompt: string;
  answer: string;
  options: string[];
  explain: string;
  hit: Hit;
  link: string;
}

const TECH_QUESTIONS: { id: string; spec: ScoreSpec }[] = [
  { id: 'accent', spec: { bars: [{ sn: 'X' }] } },
  { id: 'marcato', spec: { bars: [{ sn: '^' }] } },
  { id: 'ghost', spec: { bars: [{ sn: 'g' }] } },
  { id: 'rimshot', spec: { bars: [{ sn: 'r' }] } },
  { id: 'cross-stick', spec: { bars: [{ sn: 'c' }] } },
  { id: 'flam', spec: { bars: [{ sn: 'f' }] } },
  { id: 'drag', spec: { bars: [{ sn: 'd' }] } },
  { id: 'buzz', spec: { bars: [{ sn: 'z' }] } },
  { id: 'roll', spec: { bars: [{ sn: 'R' }] } },
  { id: 'open-hat', spec: { bars: [{ hh: 'o' }] } },
  { id: 'closed-hat', spec: { bars: [{ hh: '+' }] } },
  { id: 'half-open', spec: { bars: [{ hh: 'h' }] } },
  { id: 'foot-hat', spec: { bars: [{ hf: 'x' }] } },
  { id: 'bell', spec: { bars: [{ rd: 'b' }] } },
  { id: 'choke', spec: { bars: [{ cr: 'k' }] } },
];

const TECHNIQUES = new Map(TECHNIQUE_GROUPS.flatMap((g) => g.items).map((t) => [t.id, t]));

const shuffle = <T>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function drumQuestion(prev?: string): Question {
  const inst = pick(KEY_ORDER.filter((i) => INSTRUMENTS[i].name !== prev));
  const info = INSTRUMENTS[inst];
  // Prefer distractors that sit near the answer on the staff.
  const others = KEY_ORDER.filter((i) => i !== inst).sort(
    (a, b) => Math.abs(INSTRUMENTS[a].pos - info.pos) - Math.abs(INSTRUMENTS[b].pos - info.pos) + (Math.random() - 0.5) * 3,
  );
  const options = shuffle([inst, ...others.slice(0, 3)]).map((i: Inst) => INSTRUMENTS[i].name);
  const hit: Hit = { inst, mods: [] };
  return {
    score: { beats: 1, beatUnit: 4, slots: 4, repeat: false, measures: [{ hits: new Map([[0, [hit]]]) }] },
    prompt: 'Which part of the kit is this?',
    answer: info.name,
    options,
    explain: `${info.placement}. ${info.description}`,
    hit,
    link: '#/staff',
  };
}

function hitQuestion(prev?: string): Question {
  const q = pick(TECH_QUESTIONS.filter((t) => TECHNIQUES.get(t.id)!.title !== prev));
  const tech = TECHNIQUES.get(q.id)!;
  const score = parseScore({ time: [1, 4], grid: 1, ...q.spec });
  const hit = [...score.measures[0].hits.values()][0][0];
  const others = shuffle(TECH_QUESTIONS.filter((t) => t.id !== q.id)).slice(0, 3);
  const options = shuffle([q, ...others]).map((t) => TECHNIQUES.get(t.id)!.title);
  return {
    score,
    prompt: 'What does this marking mean?',
    answer: tech.title,
    options,
    explain: tech.body,
    hit,
    link: `#/hits/${tech.id}`,
  };
}

const BEST_KEY = 'drum-notation:best-streak';

export function quizView(root: HTMLElement) {
  let mode: Mode = 'drums';
  let correct = 0;
  let total = 0;
  let streak = 0;
  let best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
  let question: Question;
  let answered = false;
  let view: ScoreView | null = null;

  const statEl = (label: string) => {
    const b = h('b', {}, '0');
    return { el: h('div', { class: 'stat' }, b, h('span', {}, label)), b };
  };
  const sScore = statEl('Score');
  const sStreak = statEl('Streak');
  const sBest = statEl('Best');
  const updateStats = () => {
    sScore.b.textContent = `${correct}/${total}`;
    sStreak.b.textContent = String(streak);
    sBest.b.textContent = String(best);
  };

  const modeButtons = (['drums', 'hits'] as Mode[]).map((m) =>
    h(
      'button',
      {
        type: 'button',
        class: m === mode ? 'active' : '',
        onclick: () => {
          mode = m;
          modeButtons.forEach((b, i) => b.classList.toggle('active', ['drums', 'hits'][i] === m));
          next();
        },
      },
      m === 'drums' ? 'Name the drum' : 'Name the hit',
    ),
  );

  const paper = h('div', { class: 'paper' });
  const prompt = h('div', { class: 'question' });
  const answers = h('div', { class: 'answers' });
  const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const hearBtn = h('button', { class: 'btn', type: 'button', html: `${ICONS.speaker} Hear it` });
  hearBtn.addEventListener('click', () => playHit(question.hit));
  const nextBtn = h('button', { class: 'btn primary', type: 'button' }, 'Next question →');
  nextBtn.addEventListener('click', () => next());

  function next() {
    question = mode === 'drums' ? drumQuestion(question?.answer) : hitQuestion(question?.answer);
    answered = false;
    view?.destroy();
    view = mountScore(paper, question.score, { timeSig: false, rests: false, barlines: false, spacePx: 16 });
    prompt.textContent = question.prompt;
    feedback.replaceChildren(h('span', {}, 'Choose an answer. Not sure? Press “Hear it” for a clue.'));
    answers.replaceChildren(
      ...question.options.map((opt) => {
        const b = h('button', { class: 'btn', type: 'button' }, opt);
        b.addEventListener('click', () => answer(opt, b));
        return b;
      }),
    );
    nextBtn.hidden = true;
  }

  function answer(opt: string, btn: HTMLButtonElement) {
    if (answered) return;
    answered = true;
    total++;
    const ok = opt === question.answer;
    if (ok) {
      correct++;
      streak++;
      if (streak > best) {
        best = streak;
        localStorage.setItem(BEST_KEY, String(best));
      }
    } else {
      streak = 0;
      btn.classList.add('wrong');
    }
    answers.querySelectorAll('button').forEach((b) => {
      if (b.textContent === question.answer) b.classList.add('correct');
    });
    playHit(question.hit);
    feedback.replaceChildren(
      h('strong', { class: ok ? 'good' : 'bad' }, ok ? 'Correct! ' : `It’s ${question.answer}. `),
      h('span', {}, question.explain + ' '),
      h('a', { href: question.link }, 'Learn more'),
    );
    nextBtn.hidden = false;
    updateStats();
  }

  root.append(
    h(
      'section',
      { class: 'hero' },
      h('span', { class: 'eyebrow' }, 'Test yourself'),
      h('h1', {}, 'Notation quiz'),
      h('p', { class: 'lead' }, 'Flash cards for drum notation. Build a streak by naming each drum or marking at a glance.'),
    ),
    h(
      'div',
      { class: 'quiz-top' },
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Quiz mode' }, modeButtons),
      h('div', { class: 'stats' }, sScore.el, sStreak.el, sBest.el),
    ),
    h(
      'article',
      { class: 'card quiz-card' },
      paper,
      prompt,
      answers,
      feedback,
      h('div', { class: 'quiz-actions' }, hearBtn, nextBtn),
    ),
  );
  updateStats();
  next();
}
