import './styles.css';
import { gitHubLink } from './ui/github-link';
import { stopPlayback } from './ui/playback';
import { staffView } from './views/staff';
import { rhythmView } from './views/rhythm';
import { hitsView } from './views/hits';
import { groovesView } from './views/grooves';
import { quizView } from './views/quiz';

type View = (root: HTMLElement, param?: string) => void;

const ROUTES: Record<string, View> = {
  staff: staffView,
  rhythm: rhythmView,
  hits: hitsView,
  grooves: groovesView,
  quiz: quizView,
};

const root = document.getElementById('view')!;
document.body.append(gitHubLink());
let currentRoute = '';

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
  root.replaceChildren();
  ROUTES[key](root, param);
  if (!sameView) window.scrollTo({ top: 0 });
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
