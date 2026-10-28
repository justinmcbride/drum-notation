import { GLYPH_BOXES } from '../notation/glyph-metrics';

type Child = Node | string | null | undefined | false;

/** Tiny hyperscript helper for building DOM. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      node.className = String(value);
    } else if (key === 'html') {
      node.innerHTML = String(value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

export const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/></svg>',
  speaker:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

/** Builds a round play/stop toggle button. */
export function playButton(label: string, onToggle: () => void) {
  const btn = h('button', { class: 'play-btn', type: 'button', 'aria-label': `Play ${label}`, onclick: onToggle });
  const set = (playing: boolean) => {
    btn.innerHTML = playing ? ICONS.stop : ICONS.play;
    btn.classList.toggle('playing', playing);
    btn.setAttribute('aria-label', `${playing ? 'Stop' : 'Play'} ${label}`);
  };
  set(false);
  return { btn, set };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Renders SMuFL glyphs as a tightly-cropped inline SVG using Bravura's metadata,
 * so glyphs are optically centered regardless of where they sit on the baseline.
 */
export function glyphIcon(glyphs: string, space = 12, className = 'glyph-icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  let cursor = 0;
  let [x1, y1, x2, y2] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ch of glyphs) {
    const box = GLYPH_BOXES[ch] ?? [1, 0, -0.5, 1, 0.5];
    const [adv, swX, swY, neX, neY] = box;
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(cursor));
    t.setAttribute('y', '0');
    t.textContent = ch;
    svg.appendChild(t);
    x1 = Math.min(x1, cursor + swX);
    x2 = Math.max(x2, cursor + neX);
    y1 = Math.min(y1, -neY);
    y2 = Math.max(y2, -swY);
    cursor += Math.max(adv, neX) + 0.18;
  }
  const pad = 0.1;
  const w = x2 - x1 + pad * 2;
  const hgt = y2 - y1 + pad * 2;
  svg.setAttribute('viewBox', `${x1 - pad} ${y1 - pad} ${w} ${hgt}`);
  svg.setAttribute('width', String(Math.round(w * space)));
  svg.setAttribute('height', String(Math.round(hgt * space)));
  svg.setAttribute('font-family', 'Bravura');
  svg.setAttribute('font-size', '4');
  svg.setAttribute('fill', 'currentColor');
  return svg;
}

/**
 * A glyph on a short five-line staff segment. `pos` uses the score's convention:
 * 0 = bottom line, 8 = top line, so rests hang/sit on the correct line.
 */
export function staffGlyph(ch: string, pos: number, space = 8) {
  const [adv] = GLYPH_BOXES[ch] ?? [1.2];
  const width = 3.6;
  const top = -1.8;
  const height = 6.6;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'staff-glyph');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', `0 ${top} ${width} ${height}`);
  svg.setAttribute('width', String(Math.round(width * space)));
  svg.setAttribute('height', String(Math.round(height * space)));
  for (let i = 0; i < 5; i++) {
    const line = document.createElementNS(SVG_NS, 'rect');
    line.setAttribute('x', '0');
    line.setAttribute('y', String(i - 0.06));
    line.setAttribute('width', String(width));
    line.setAttribute('height', '0.12');
    line.setAttribute('class', 'staff-glyph-line');
    svg.appendChild(line);
  }
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', String((width - adv) / 2));
  t.setAttribute('y', String((8 - pos) / 2));
  t.setAttribute('font-family', 'Bravura');
  t.setAttribute('font-size', '4');
  t.setAttribute('fill', 'currentColor');
  t.textContent = ch;
  svg.appendChild(t);
  return svg;
}
