import { useSyncExternalStore } from 'react';
import { ConceptId, Problem } from '../engine/types';
import { inHost, onHost, post } from '../host';

/** Where the learner is. Screens are a stack so "back" always means what it looks like. */
export type Route =
  | { name: 'home' }
  | { name: 'lessons' }
  | { name: 'lesson'; topicId: string; tab?: 'lesson' | 'practice' }
  | { name: 'practice' }
  | { name: 'session'; topicId?: string; problems?: Problem[]; title?: string }
  | { name: 'progress' }
  | { name: 'settings' }
  | { name: 'streak' }
  | { name: 'saved'; topicId?: string }
  | { name: 'upload' };

export type Overlay =
  | { name: 'review'; concept: ConceptId }
  | { name: 'ask'; topicId?: string; seed?: string; problem?: Problem; lines?: string[] }
  | null;

interface NavState {
  stack: Route[];
  dir: 1 | -1 | 0;
  overlay: Overlay;
}

const TABS = ['home', 'lessons', 'practice', 'progress'];

let nav: NavState = { stack: [{ name: 'home' }], dir: 0, overlay: null };
/** What is on screen. The same as `nav`, except for the moment the native app is sliding these screens away. */
let view: NavState = nav;
const listeners = new Set<() => void>();

/*
 * The phone's own back button (and the browser's) walks the same stack as the arrows on screen.
 * Every pushed screen or open sheet has one entry in the browser history; "back" pops both.
 */
let pushed = 0;
let skipPop = 0;
let guard: (() => boolean) | null = null;
const canHistory = typeof window !== 'undefined' && typeof history !== 'undefined';

function syncHistory(): void {
  if (!canHistory) return;
  const want = nav.stack.length - 1 + (nav.overlay ? 1 : 0);
  try {
    while (pushed < want) {
      history.pushState({ lera: pushed + 1 }, '');
      pushed++;
    }
    if (pushed > want) {
      skipPop++;
      history.go(want - pushed);
      pushed = want;
    }
  } catch {
    /* sandboxed pages can refuse history; the on-screen arrows still work */
  }
}

/** Inside the native app the four tabs are native; these screens only show for what sits on top of them. */
const deep = (n: NavState): boolean => n.stack.length > 1 || n.overlay !== null;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;

const emit = () => {
  syncHistory();
  clearTimeout(leaveTimer);
  if (inHost) {
    const top = nav.stack[nav.stack.length - 1];
    post({ t: 'nav', deep: deep(nav), depth: nav.stack.length, top: top.name, overlay: nav.overlay?.name ?? null, tab: nav.stack[0].name });
    if (deep(view) && !deep(nav)) {
      // keep the screen drawn while the native app slides it away, then let go of it
      leaveTimer = setTimeout(() => {
        view = nav;
        listeners.forEach((l) => l());
      }, 280);
      return;
    }
  }
  view = nav;
  listeners.forEach((l) => l());
};

/** A screen can ask to be consulted before "back" leaves it (a practice session in progress, say). Return true to stay. */
export const setBackGuard = (fn: (() => boolean) | null): void => {
  guard = fn;
};

export const go = (route: Route): void => {
  // the four tabs replace each other; everything else is pushed on top
  if (TABS.includes(route.name)) nav = { ...nav, stack: [route], dir: 0, overlay: null };
  else nav = { ...nav, stack: [...nav.stack, route], dir: 1 };
  emit();
};

export const replace = (route: Route): void => {
  nav = { ...nav, stack: [...nav.stack.slice(0, -1), route], dir: 0 };
  emit();
};

function pop(): void {
  if (nav.overlay) {
    nav = { ...nav, overlay: null };
  } else if (nav.stack.length > 1) {
    nav = { ...nav, stack: nav.stack.slice(0, -1), dir: -1 };
  } else if (nav.stack[0].name !== 'home') {
    nav = { ...nav, stack: [{ name: 'home' }], dir: -1 };
  }
}

export const back = (): void => {
  pop();
  emit();
};

if (canHistory) {
  window.addEventListener('popstate', () => {
    if (skipPop > 0) {
      skipPop--;
      return;
    }
    // the system took one history entry away; follow it, unless the screen wants to stay
    pushed = Math.max(0, pushed - 1);
    if (!nav.overlay && guard && guard()) {
      syncHistory();
      return;
    }
    pop();
    emit();
  });
}

if (inHost) {
  onHost((m) => {
    const base = { name: (m.base as Route['name']) ?? nav.stack[0].name } as Route;
    if (m.t === 'go') {
      nav = { stack: [base, m.route as Route], dir: 0, overlay: null };
      emit();
    } else if (m.t === 'overlay') {
      nav = { stack: [base], dir: 0, overlay: m.overlay as Overlay };
      emit();
    } else if (m.t === 'back') {
      // the phone's back button, pressed while one of these screens is showing
      if (!nav.overlay && guard && guard()) return;
      back();
    } else if (m.t === 'reset') {
      resetNav();
    }
  });
}

export const resetNav = (): void => {
  nav = { stack: [{ name: 'home' }], dir: 0, overlay: null };
  emit();
};

export const openOverlay = (overlay: Overlay): void => {
  nav = { ...nav, overlay };
  emit();
};

export const closeOverlay = (): void => openOverlay(null);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useNav(): NavState & { route: Route } {
  const s = useSyncExternalStore(subscribe, () => view);
  return { ...s, route: s.stack[s.stack.length - 1] };
}
