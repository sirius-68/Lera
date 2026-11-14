import { useSyncExternalStore } from 'react';
import { BUILD_AI } from '../ai/config';
import { AttemptAnalysis, ConceptId, Problem } from '../engine/types';
import { LeraDoc } from '../ingest/types';
import { idbAll, idbAvailable, idbClear, idbDelete, idbPut } from './docdb';
import { AttemptMeta, dayOf, recordAttempt } from './learner';
import { AppState, ChatMsg, Highlight, Note, Profile, SavedItem } from './types';

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
  subjects: ['algebra'],
  dailyXp: 30,
  checkMode: 'line',
  notifications: false,
  plan: 'none',
  onboarded: false,
});

export const emptyState = (): AppState => ({
  version: 1,
  profile: emptyProfile(),
  ai: { ...BUILD_AI },
  docs: [],
  highlights: [],
  notes: [],
  saved: [],
  concepts: {},
  attempts: [],
  solved: {},
  read: {},
  understood: {},
  chats: {},
});

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw) as Partial<AppState>;
    if (data.version !== 1) return emptyState();
    const base = emptyState();
    // the AI backend comes from the build, never from what an older version stored
    return { ...base, ...data, profile: { ...base.profile, ...data.profile }, ai: { ...BUILD_AI } };
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

/** True once the notes are kept in IndexedDB; from then on localStorage holds everything except them. */
let docsInIdb = false;
/** False until the notes have been read back at start-up. */
let hydrated = !(typeof window !== 'undefined' && idbAvailable());

function save(): void {
  const write = (withDocs: boolean) => localStorage.setItem(KEY, JSON.stringify(withDocs ? state : { ...state, docs: [] }));
  try {
    write(!docsInIdb);
    persisted = true;
  } catch {
    try {
      // most likely too big with the notes included: keep the rest
      write(false);
      persisted = docsInIdb;
    } catch {
      persisted = false;
    }
  }
}

function hydrate(): void {
  idbAll()
    .then(async (stored) => {
      // notes an older version kept in localStorage move across once
      const legacy = state.docs.filter((d) => !stored.some((x) => x.id === d.id));
      for (const d of legacy) await idbPut(d);
      const docs = [...legacy, ...stored].sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
      docsInIdb = true;
      state = { ...state, docs, activeDocId: docs.some((d) => d.id === state.activeDocId) ? state.activeDocId : docs[0]?.id };
    })
    .catch(() => {
      // no IndexedDB here (private window, old web view): notes stay in localStorage as before
      docsInIdb = false;
    })
    .finally(() => {
      hydrated = true;
      listeners.forEach((l) => l());
      if (docsInIdb) save();
    });
}

const store = (work: Promise<unknown>): void => {
  work.catch(() => {
    persisted = false;
  });
};

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

/** Run something after every change to the saved state (used to keep the home-screen widget current). */
export const onChange = (l: () => void): (() => void) => subscribe(l);

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Subscribe a component to a slice of the state. The selector must return a stable reference. */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

/** False for the instant at start-up before the notes have been read back. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => hydrated);
}

if (typeof window !== 'undefined') {
  if (!hydrated) hydrate();
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

  addDoc(doc: LeraDoc): void {
    if (docsInIdb) store(idbPut(doc));
    setState((s) => ({
      docs: [doc, ...s.docs.filter((d) => d.id !== doc.id)],
      activeDocId: doc.id,
      lastTopicId: doc.units[0]?.topics[0]?.id ?? s.lastTopicId,
    }));
  },

  removeDoc(id: string): void {
    if (docsInIdb) store(idbDelete(id));
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

  togglePin(id: string): void {
    setState((s) => ({ saved: s.saved.map((x) => (x.id === id ? { ...x, pinned: !x.pinned } : x)) }));
  },

  /** The learner's answer to "did that make sense?" for one idea. */
  setUnderstood(concept: ConceptId, ok: boolean): void {
    setState((s) => ({ understood: { ...s.understood, [concept]: ok ? dayOf() : 'no' } }));
  },

  /** Replace one conversation thread (kept to its most recent messages). */
  setChat(thread: string, msgs: ChatMsg[]): void {
    setState((s) => ({ chats: { ...s.chats, [thread]: msgs.slice(-80) } }));
  },

  clearChat(thread: string): void {
    setState((s) => {
      const chats = { ...s.chats };
      delete chats[thread];
      return { chats };
    });
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
    if (docsInIdb) store(idbClear());
    state = emptyState();
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing stored */
    }
    listeners.forEach((l) => l());
  },
};
