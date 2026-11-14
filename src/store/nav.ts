import { useSyncExternalStore } from 'react';
import { ConceptId, Problem } from '../engine/types';

/** Where the learner is. Screens are a stack so "back" always means what it looks like. */
export type Route =
  | { name: 'home' }
  | { name: 'lessons' }
  | { name: 'lesson'; topicId: string; tab?: 'lesson' | 'practice' }
  | { name: 'practice' }
  | { name: 'session'; topicId?: string; problems?: Problem[]; title?: string }
  | { name: 'progress' }
  | { name: 'settings' }
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
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const go = (route: Route): void => {
  // the four tabs replace each other; everything else is pushed on top
  if (TABS.includes(route.name)) nav = { ...nav, stack: [route], dir: 0 };
  else nav = { ...nav, stack: [...nav.stack, route], dir: 1 };
  emit();
};

export const replace = (route: Route): void => {
  nav = { ...nav, stack: [...nav.stack.slice(0, -1), route], dir: 0 };
  emit();
};

export const back = (): void => {
  if (nav.overlay) {
    nav = { ...nav, overlay: null };
  } else if (nav.stack.length > 1) {
    nav = { ...nav, stack: nav.stack.slice(0, -1), dir: -1 };
  } else if (nav.stack[0].name !== 'home') {
    nav = { ...nav, stack: [{ name: 'home' }], dir: -1 };
  }
  emit();
};

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
  const s = useSyncExternalStore(subscribe, () => nav);
  return { ...s, route: s.stack[s.stack.length - 1] };
}
