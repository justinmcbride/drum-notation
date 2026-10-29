import './styles.css';
import { gitHubLink } from './ui/github-link';
import { applyLevel } from './ui/level';
import { stopPlayback } from './ui/playback';
import { staffView } from './views/staff';
import { rhythmView } from './views/rhythm';
import { hitsView } from './views/hits';
import { groovesView } from './views/grooves';
import { quizView } from './views/quiz';

/** A view may return an updater to switch its param in place instead of being rebuilt. */
type View = (root: HTMLElement, param?: string) => void | ((param?: string) => void);

const ROUTES: Record<string, View> = {
  staff: staffView,
  rhythm: rhythmView,
  hits: hitsView,
  grooves: groovesView,
  quiz: quizView,
};

applyLevel();
const root = document.getElementById('view')!;
document.body.append(gitHubLink());
let currentRoute = '';
let updateView: ((param?: string) => void) | null = null;

function route() {
  const [name = 'staff', param] = location.hash.replace(/^#\/?/, '').split('/');
  const key = name in ROUTES ? name : 'staff';
  stopPlayback();
  document.querySelectorAll<HTMLAnchorElement>('.tabs a').forEach((a) => {
    const active = a.dataset.tab === key;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const routeKey = `${key}/${param ?? ''}`;
  if (routeKey === currentRoute) return;
  const sameView = currentRoute.split('/')[0] === key;
  currentRoute = routeKey;
  if (sameView && updateView) {
    updateView(param);
    return;
  }
  if (!sameView) {
    root.replaceChildren();
    updateView = ROUTES[key](root, param) || null;
    window.scrollTo({ top: 0 });
    return;
  }
  // Rebuilding the same view: hold the page height so the browser doesn't clamp the scroll position.
  const y = window.scrollY;
  root.style.minHeight = `${root.offsetHeight}px`;
  root.replaceChildren();
  updateView = ROUTES[key](root, param) || null;
  window.scrollTo({ top: y, behavior: 'instant' });
  requestAnimationFrame(() => requestAnimationFrame(() => root.style.removeProperty('min-height')));
}

async function boot() {
  try {
    await document.fonts.load('40px Bravura', '\uE069');
  } catch {
    // Render anyway; glyphs will appear once the font arrives.
  }
  window.addEventListener('hashchange', route);
  route();
}

void boot();
