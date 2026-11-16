import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles/base.css';
import './styles/screens.css';
import './styles/v2.css';
import { App } from './App';
import { actions, getState, isHydrated, onChange } from './store';
import { go } from './store/nav';
import { setWidgetTestMode, syncWidget, takeWidgetAction } from './store/widget';
import { hostConfig, inHost, onHost, post } from './host';
import type { AppState } from './store/types';

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

if (inHost) {
  startHostLink();
} else {
  startWidgetLink();
}

/**
 * Inside the native app: the native tabs draw from a copy of the state, so every change is sent across
 * (only the parts that changed, and the lessons without their text), and the native side sends back
 * the actions its buttons ask for.
 */
function startHostLink(): void {
  const sent: Partial<Record<keyof AppState, unknown>> = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slimDocs = (docs: AppState['docs']) =>
    docs.map((d) => ({
      ...d,
      glossary: {},
      units: d.units.map((u) => ({ ...u, topics: u.topics.map((t) => ({ ...t, blocks: t.blocks.length ? [{}] : [] })) })),
    }));
  const flush = () => {
    const s = getState();
    const patch: Record<string, unknown> = {};
    (Object.keys(s) as (keyof AppState)[]).forEach((k) => {
      if (k === 'ai' || sent[k] === s[k]) return;
      sent[k] = s[k];
      patch[k] = k === 'docs' ? slimDocs(s.docs) : s[k];
    });
    if (Object.keys(patch).length) post({ t: 'state', patch });
  };
  const queue = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, 40);
  };
  onChange(queue);
  onHost((m) => {
    if (m.t === 'act') {
      const fn = (actions as unknown as Record<string, (...a: unknown[]) => unknown>)[m.name as string];
      if (typeof fn === 'function') fn(...((m.args as unknown[]) ?? []));
    } else if (m.t === 'sync') {
      (Object.keys(sent) as (keyof AppState)[]).forEach((k) => delete sent[k]);
      flush();
    }
  });
  // the widget buttons in Settings ask the native side, which owns the widget
  if (hostConfig?.canPin !== undefined) {
    (globalThis as Record<string, unknown>).LeraNative = {
      setWidget: () => undefined,
      canPin: () => hostConfig.canPin === true,
      pinWidget: (wide: boolean) => (post({ t: 'pin', wide }), true),
      takeAction: () => '',
    };
  }
  // tell the native side once the lessons have been read back, then send everything
  const ready = setInterval(() => {
    if (isHydrated()) {
      clearInterval(ready);
      flush();
      post({ t: 'ready' });
      if (getState().profile.onboarded) actions.track('open');
    }
  }, 30);
}

function startWidgetLink(): void {
// keep the Android home-screen widgets in step with the app (does nothing in a browser)
let widgetTimer: ReturnType<typeof setTimeout> | undefined;
const pushWidget = (force = false) => {
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => syncWidget(getState(), force), 400);
};
// a tap on the widget's card opens the app on Practice
const followWidget = () => {
  const s = getState();
  if (takeWidgetAction() !== 'practice') return;
  actions.track('widget');
  if (s.profile.onboarded && !(s.profile.email && s.profile.signedIn === false)) go({ name: 'practice' });
};
// the widget always runs on real time (an earlier test build could leave a fast-forward mode switched on)
setWidgetTestMode(false);
onChange(() => pushWidget());
pushWidget(true);
setTimeout(() => {
  if (getState().profile.onboarded) actions.track('open');
  followWidget();
}, 900);
document.addEventListener('visibilitychange', () => {
  pushWidget(true);
  if (!document.hidden) followWidget();
});

}
