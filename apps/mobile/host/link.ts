import { useSyncExternalStore } from 'react';
import type { ConceptId, Problem } from '@core/engine/types';
import type { AppState } from '@core/store/types';

/**
 * The link between the native app and Lera's web screens (see src/host.ts for the other end).
 *
 * The web side owns the saved state and every action on it. The native side keeps a copy to draw the
 * tabs from, and sends back what its buttons ask for. So there is one place where progress is changed
 * and saved, and nothing can drift apart.
 */
export type Tab = 'home' | 'lessons' | 'practice' | 'progress';
export const TABS: Tab[] = ['home', 'lessons', 'practice', 'progress'];

export type Route =
  | { name: Tab }
  | { name: 'lesson'; topicId: string; tab?: 'lesson' | 'practice' }
  | { name: 'session'; topicId?: string; problems?: Problem[]; title?: string }
  | { name: 'settings' | 'streak' | 'upload' }
  | { name: 'saved'; topicId?: string };
export type Overlay = { name: 'review'; concept: ConceptId } | { name: 'ask'; topicId?: string; seed?: string };

export type Msg = { t: string } & Record<string, unknown>;

export interface Shell {
  /** The web screens have loaded and sent the state. */
  ready: boolean;
  tab: Tab;
  /** A web screen (or sheet) is open on top of the tabs. */
  deep: boolean;
  /** Only a sheet is open, over a tab that stays visible. */
  sheet: boolean;
  toast: { id: number; text: string } | null;
}

const emptyState = (): AppState =>
  ({
    version: 1,
    profile: { name: '', onboarded: false, dailyXp: 30 },
    docs: [], concepts: {}, attempts: [], highlights: [], notes: [], saved: [], solved: {}, read: {}, understood: {}, chats: {}, events: [],
  }) as unknown as AppState;

let state: AppState = emptyState();
let shell: Shell = { ready: false, tab: 'home', deep: false, sheet: false, toast: null };
const subs = new Set<() => void>();
const notify = () => subs.forEach((l) => l());
const subscribe = (l: () => void) => (subs.add(l), () => subs.delete(l));

export const getApp = (): AppState => state;
export const getShell = (): Shell => shell;
export const onAppChange = subscribe;
/** A slice of the learner's state. The selector must return a stable reference. */
export const useApp = <T,>(sel: (s: AppState) => T): T => useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
export const useShell = <T,>(sel: (s: Shell) => T): T => useSyncExternalStore(subscribe, () => sel(shell), () => sel(shell));

let sender: ((m: Msg) => void) | null = null;
export const attach = (fn: ((m: Msg) => void) | null): void => {
  sender = fn;
};
export const send = (m: Msg): void => sender?.(m);

/** Run one of the store's actions (src/store/index.ts) on the web side. */
export const act = (name: string, ...args: unknown[]): void => send({ t: 'act', name, args });

export const setTab = (tab: Tab): void => {
  if (shell.tab === tab) return;
  shell = { ...shell, tab };
  notify();
};

/** Go somewhere: a tab is switched natively, anything deeper opens as a web screen on top. */
export function go(route: Route): void {
  if ((TABS as string[]).includes(route.name)) setTab(route.name as Tab);
  else send({ t: 'go', route, base: shell.tab });
}
export const openOverlay = (overlay: Overlay): void => send({ t: 'overlay', overlay, base: shell.tab });

let toastId = 0;
export const toast = (text: string): void => {
  const id = ++toastId;
  shell = { ...shell, toast: { id, text } };
  notify();
  setTimeout(() => {
    if (shell.toast?.id === id) {
      shell = { ...shell, toast: null };
      notify();
    }
  }, 2200);
};

/** What the web side tells us about itself. Everything else it sends (haptics, share…) is handled in Island.tsx. */
export function receive(m: Msg): void {
  if (m.t === 'state') {
    state = { ...state, ...(m.patch as Partial<AppState>) };
    notify();
  } else if (m.t === 'ready') {
    shell = { ...shell, ready: true };
    notify();
  } else if (m.t === 'nav') {
    const tab = (TABS as string[]).includes(m.tab as string) ? (m.tab as Tab) : shell.tab;
    const deep = m.deep === true;
    shell = { ...shell, deep, sheet: deep && m.depth === 1, tab: deep ? shell.tab : tab };
    notify();
  }
}

/** True while the web screens must cover everything: first run, or signed out. */
export const gated = (s: AppState): boolean => !s.profile.onboarded || (!!s.profile.email && s.profile.signedIn === false);
