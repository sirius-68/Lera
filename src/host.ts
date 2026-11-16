/**
 * Lera's screens can run inside the native app (apps/mobile), which draws the tabs itself and shows
 * these screens on top for everything deeper: lessons, practice, upload, Ask Lera, the notebook.
 *
 * The native side puts `window.__LERA_HOST__` in the page before anything runs. When it is there,
 * this file is the only link between the two: small JSON messages each way. In a browser, or in the
 * older Android build, none of this is active.
 */
export interface HostConfig {
  platform?: 'android' | 'ios' | 'web';
  /** The phone's language, e.g. 'fr-FR'. */
  lang?: string;
  insets?: { top: number; bottom: number };
  /** The launcher can add a home-screen widget for us (Android). */
  canPin?: boolean;
  /** The saved state the native side kept, used only if this page's own storage came back empty. */
  backup?: string;
}

export type HostMsg = { t: string } & Record<string, unknown>;

interface HostWindow {
  __LERA_HOST__?: HostConfig;
  __leraHost?: (m: HostMsg) => void;
  ReactNativeWebView?: { postMessage(s: string): void };
}

const w = typeof window !== 'undefined' ? (window as unknown as HostWindow & Window) : undefined;

export const hostConfig: HostConfig | null = w?.__LERA_HOST__ ?? null;
/** True when these screens are running inside the native app. */
export const inHost = hostConfig !== null;

export function post(msg: HostMsg): void {
  if (!w || !inHost) return;
  try {
    const s = JSON.stringify(msg);
    if (w.ReactNativeWebView) w.ReactNativeWebView.postMessage(s);
    else if (w.parent && w.parent !== w) w.parent.postMessage({ lera: s }, '*');
  } catch {
    /* the native side went away; nothing to tell */
  }
}

const handlers = new Set<(m: HostMsg) => void>();
export const onHost = (fn: (m: HostMsg) => void): (() => void) => {
  handlers.add(fn);
  return () => handlers.delete(fn);
};

let nextId = 1;
const waiting = new Map<number, (m: HostMsg) => void>();
/** Ask the native side something and wait for its answer (for example: may I send reminders?). */
export function ask(msg: HostMsg, timeout = 60000): Promise<HostMsg | null> {
  if (!inHost) return Promise.resolve(null);
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    setTimeout(() => waiting.delete(id) && resolve(null), timeout);
    post({ ...msg, id });
  });
}

function receive(m: HostMsg): void {
  if (m.t === 'reply' && typeof m.id === 'number') {
    const done = waiting.get(m.id);
    waiting.delete(m.id);
    done?.(m);
    return;
  }
  handlers.forEach((h) => h(m));
}

if (w && inHost) {
  w.__leraHost = receive;
  w.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { leraHost?: HostMsg } | null;
    if (d && typeof d === 'object' && d.leraHost) receive(d.leraHost);
  });

  // the phone's own vibration, clipboard and share sheet, which a page inside an app cannot reach by itself
  const nav = navigator as unknown as Record<string, unknown>;
  const set = (key: string, value: unknown) => {
    try {
      Object.defineProperty(nav, key, { value, configurable: true });
    } catch {
      /* this web view keeps its own */
    }
  };
  set('vibrate', (ms: number | number[]) => (post({ t: 'haptic', ms }), true));
  set('clipboard', { writeText: (text: string) => (post({ t: 'copy', text }), Promise.resolve()) });
  set('share', (p: { title?: string; text?: string }) => (post({ t: 'share', title: p.title ?? '', text: p.text ?? '' }), Promise.resolve()));

  const root = document.documentElement;
  const applyInsets = (i?: { top: number; bottom: number }) => {
    if (!i) return;
    root.style.setProperty('--safe-t', `${Math.round(i.top)}px`);
    root.style.setProperty('--safe-b', `${Math.round(i.bottom)}px`);
  };
  applyInsets(hostConfig?.insets);
  root.classList.add('in-host');
  handlers.add((m) => {
    if (m.t === 'insets') applyInsets(m.insets as { top: number; bottom: number });
  });
}
