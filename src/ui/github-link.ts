import githubMark from '../assets/github-mark-white.svg';
import { h } from './dom';

const REPO_URL = 'https://github.com/justinmcbride/drum-notation';

// [left, top, size] in px, matching the original component's bubbles.
const BUBBLES: [number, number, number][] = [
  [20, 20, 8],
  [10, 25, 12],
  [30, 15, 6],
  [5, 30, 10],
  [25, 10, 8],
  [15, 35, 4],
];

/** Floating GitHub mark that blows bubbles on hover (ported from react-pig-latin-translator). */
export function gitHubLink() {
  return h(
    'div',
    { class: 'gh-link' },
    h(
      'a',
      { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'View source on GitHub' },
      h(
        'div',
        { class: 'gh-bubbles', 'aria-hidden': 'true' },
        BUBBLES.map(([left, top, size], i) =>
          h('div', {
            class: `gh-bubble bubble-${i + 1}`,
            style: { left: `${left}px`, top: `${top}px`, width: `${size}px`, height: `${size}px` },
          }),
        ),
      ),
      h('img', { class: 'gh-mark', src: githubMark, alt: 'GitHub', width: '40', height: '40' }),
    ),
  );
}
