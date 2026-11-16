import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles/base.css';
import './styles/screens.css';
import './styles/v2.css';
import { App } from './App';
import { getState, onChange } from './store';
import { go } from './store/nav';
import { setWidgetTestMode, syncWidget, takeWidgetAction } from './store/widget';

/*
 * The on-screen keyboard must never cover what is being typed.
 * In the Android app the web view itself is resized (see android-overrides/MainActivity.java);
 * in a browser the visual viewport shrinks instead, so the app's height follows it.
 */
const vv = window.visualViewport;
if (vv) {
  const fit = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
    document.documentElement.classList.toggle('kb-open', kb > 80 || window.innerHeight < 480);
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
  fit();
}
// once the keyboard has finished opening, bring the field being typed into view
const reveal = (e: Event) => {
  const t = e.target as HTMLElement | null;
  if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.getAttribute('inputmode') === 'none') return;
  [250, 600].forEach((ms) => setTimeout(() => document.activeElement === t && t.scrollIntoView({ block: 'center', behavior: 'smooth' }), ms));
};
window.addEventListener('focusin', reveal);
window.addEventListener('resize', () => {
  const a = document.activeElement as HTMLElement | null;
  if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.getAttribute('inputmode') !== 'none') a.scrollIntoView({ block: 'center' });
});

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);

// keep the Android home-screen widgets in step with the app (does nothing in a browser)
let widgetTimer: ReturnType<typeof setTimeout> | undefined;
const pushWidget = (force = false) => {
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => syncWidget(getState(), force), 400);
};
// a tap on the widget's card opens the app on Practice
const followWidget = () => {
  const s = getState();
  if (takeWidgetAction() === 'practice' && s.profile.onboarded && !(s.profile.email && s.profile.signedIn === false)) go({ name: 'practice' });
};
// the widget always runs on real time (an earlier test build could leave a fast-forward mode switched on)
setWidgetTestMode(false);
onChange(() => pushWidget());
pushWidget(true);
setTimeout(followWidget, 900);
document.addEventListener('visibilitychange', () => {
  pushWidget(true);
  if (!document.hidden) followWidget();
});
