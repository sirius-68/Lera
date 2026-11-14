import { useSyncExternalStore } from 'react';
import { AiConfig, NO_AI } from '../ai/providers';
import { AttemptAnalysis, ConceptId, Problem } from '../engine/types';
import { LeraDoc } from '../ingest/types';
import { AttemptMeta, dayOf, recordAttempt } from './learner';
import { AppState, Highlight, Note, Profile, SavedItem } from './types';

/**
 * One small store for the whole app. Everything the learner does is kept on
 * this device (localStorage) — there is no server and no account behind it.
 */

const KEY = 'lera.state.v1';

export const emptyProfile = (): Profile => ({
  name: '',
  email: '',
  language: 'en',
  focusMinutes: 10,
  notifications: false,
  plan: 'none',
  onboarded: false,
});

export const emptyState = (): AppState => ({
  version: 1,
  profile: emptyProfile(),
  ai: { ...NO_AI },
  docs: [],
  highlights: [],
  notes: [],
  saved: [],
  concepts: {},
  attempts: [],
  solved: {},
  read: {},
});

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw) as Partial<AppState>;
    if (data.version !== 1) return emptyState();
    const base = emptyState();
    return { ...base, ...data, profile: { ...base.profile, ...data.profile }, ai: { ...base.ai, ...data.ai } };
  } catch {
    // private windows and sandboxed previews can refuse storage; the app still runs, it just won't remember
    return emptyState();
  }
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** False when the browser refused to store (private window, storage full). */
export let persisted = true;

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    persisted = true;
  } catch {
    persisted = false;
  }
}

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 250);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Subscribe a component to a slice of the state. The selector must return a stable reference. */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      save();
    }
  });
}

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;

/* ───────────── actions ───────────── */

export const actions = {
  setProfile(patch: Partial<Profile>): void {
    setState((s) => ({ profile: { ...s.profile, ...patch } }));
  },

  finishOnboarding(): void {
    setState((s) => ({ profile: { ...s.profile, onboarded: true, createdAt: s.profile.createdAt ?? new Date().toISOString() } }));
  },

  setAi(ai: AiConfig): void {
    setState({ ai });
  },

  addDoc(doc: LeraDoc): void {
    setState((s) => ({
      docs: [doc, ...s.docs.filter((d) => d.id !== doc.id)],
      activeDocId: doc.id,
      lastTopicId: doc.units[0]?.topics[0]?.id ?? s.lastTopicId,
    }));
  },

  removeDoc(id: string): void {
    setState((s) => {
      const doc = s.docs.find((d) => d.id === id);
      const topicIds = new Set(doc?.units.flatMap((u) => u.topics.map((t) => t.id)) ?? []);
      const docs = s.docs.filter((d) => d.id !== id);
      return {
        docs,
        activeDocId: s.activeDocId === id ? docs[0]?.id : s.activeDocId,
        lastTopicId: s.lastTopicId && topicIds.has(s.lastTopicId) ? docs[0]?.units[0]?.topics[0]?.id : s.lastTopicId,
        highlights: s.highlights.filter((h) => !topicIds.has(h.topicId)),
        notes: s.notes.filter((n) => !topicIds.has(n.topicId)),
        saved: s.saved.filter((x) => !topicIds.has(x.topicId)),
      };
    });
  },

  setActiveDoc(id: string): void {
    setState({ activeDocId: id });
  },

  openTopic(topicId: string): void {
    setState((s) => ({ lastTopicId: topicId, read: s.read[topicId] ? s.read : { ...s.read, [topicId]: dayOf() } }));
  },

  addHighlight(h: Omit<Highlight, 'id'>): void {
    setState((s) => {
      // a new highlight replaces whatever it overlaps in the same piece of text
      const kept = s.highlights.filter(
        (o) => !(o.topicId === h.topicId && o.block === h.block && o.item === h.item && o.start < h.end && h.start < o.end),
      );
      return { highlights: [...kept, { ...h, id: uid('h') }] };
    });
  },

  removeHighlight(id: string): void {
    setState((s) => ({ highlights: s.highlights.filter((h) => h.id !== id) }));
  },

  addNote(n: Omit<Note, 'id' | 'createdAt'>): void {
    setState((s) => ({ notes: [...s.notes, { ...n, id: uid('n'), createdAt: new Date().toISOString() }] }));
  },

  removeNote(id: string): void {
    setState((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
  },

  save(item: Omit<SavedItem, 'id' | 'createdAt'>): void {
    setState((s) => ({ saved: [{ ...item, id: uid('s'), createdAt: new Date().toISOString() }, ...s.saved] }));
  },

  removeSaved(id: string): void {
    setState((s) => ({ saved: s.saved.filter((x) => x.id !== id) }));
  },

  record(problem: Problem, analysis: AttemptAnalysis, meta: AttemptMeta): void {
    setState((s) => recordAttempt(s, problem, analysis, meta));
  },

  /** A review was opened and read: note it so the queue knows the concept has been looked at. */
  reviewed(concept: ConceptId): void {
    setState((s) => {
      const c = s.concepts[concept];
      if (!c) return {};
      return { concepts: { ...s.concepts, [concept]: { ...c, lastSeen: dayOf() } } };
    });
  },

  reset(): void {
    state = emptyState();
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing stored */
    }
    listeners.forEach((l) => l());
  },
};
