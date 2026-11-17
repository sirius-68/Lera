import { conceptOf } from '../engine/concepts';
import { practiceFor, seedFrom } from '../engine/generate';
import { AttemptAnalysis, ConceptId, Problem } from '../engine/types';
import { parseExercises, plain } from '../ingest/structure';
import { Block, LeraDoc, Topic } from '../ingest/types';
import { AppState, AttemptRecord, ConceptState } from './types';
import { t as tr } from '../i18n';

/**
 * The learner model — the "recursive" part of Lera.
 *
 *   practice → marks → weak concepts → review queue → back into practice
 *
 * A gap stays outstanding until the concept has been handled cleanly on two
 * different days. Slips are counted but only become a pattern when they keep
 * recurring. Everything here is a pure function of the state, so it is easy
 * to test and to reason about.
 */

export const dayOf = (d: Date = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayOf(new Date(y, m - 1, d + n));
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000);
}

const blank = (id: ConceptId): ConceptState => ({
  id, gaps: 0, slips: 0, hints: 0, clean: 0, outstanding: false, rushing: false, cleanDays: [], slipDays: [], stage: 0,
});

/** Days until a concept comes back, by how many times it has held. */
const INTERVALS = [1, 3, 7, 21, 45];

export type ConceptStatus = 'new' | 'gap' | 'shaky' | 'solid';

export function statusOf(c: ConceptState | undefined): ConceptStatus {
  if (!c || (c.gaps === 0 && c.slips === 0 && c.clean === 0)) return 'new';
  if (c.outstanding) return c.cleanDays.length === 0 ? 'gap' : 'shaky';
  if (c.rushing) return 'shaky';
  return c.clean >= 2 ? 'solid' : 'shaky';
}

/** How sure Lera is that the learner has this, 0–1. Shown as a bar, never as a grade. */
export function confidence(c: ConceptState | undefined): number {
  if (!c) return 0;
  const s = statusOf(c);
  if (s === 'new') return 0;
  if (s === 'gap') return Math.min(0.25, 0.1 + c.clean * 0.03);
  if (s === 'shaky') return c.outstanding ? 0.55 : 0.65;
  return Math.min(1, 0.8 + c.stage * 0.07);
}

export interface AttemptMeta {
  hintRung: number;
  seconds: number;
  now?: Date;
}

/** Fold one finished attempt into the learner model. Returns the new state pieces. */
export function recordAttempt(
  state: Pick<AppState, 'concepts' | 'attempts' | 'solved'>,
  problem: Problem,
  analysis: AttemptAnalysis,
  meta: AttemptMeta,
): Pick<AppState, 'concepts' | 'attempts' | 'solved'> {
  const now = meta.now ?? new Date();
  const day = dayOf(now);
  const concepts: AppState['concepts'] = { ...state.concepts };
  const touch = (id: ConceptId): ConceptState => {
    const c = { ...(concepts[id] ?? blank(id)) };
    c.cleanDays = [...c.cleanDays];
    c.slipDays = [...c.slipDays];
    c.lastSeen = day;
    concepts[id] = c;
    return c;
  };

  const marked = new Set<ConceptId>();
  const marks: AttemptRecord['marks'] = [];
  analysis.lines.forEach((l, i) => {
    if (l.status !== 'wrong' || !l.diag) return;
    marks.push({ code: l.diag.code, concept: l.diag.concept, severity: l.diag.severity, title: l.diag.title, line: i });
  });
  for (const mk of analysis.marks) {
    const c = touch(mk.concept);
    c.lastTitle = mk.title;
    if (mk.severity === 'gap') {
      c.gaps++;
      c.outstanding = true;
      c.cleanDays = [];
      c.lastGap = day;
      c.stage = 0;
      c.due = day;
      marked.add(mk.concept);
    } else if (mk.severity === 'slip') {
      c.slips++;
      if (!c.slipDays.includes(day)) c.slipDays.push(day);
      c.slipDays = c.slipDays.filter((d) => daysBetween(d, day) <= 21);
      // the same kind of slip on three separate days is no longer just rushing
      if (c.slipDays.length >= 3 && !c.outstanding) {
        c.outstanding = true;
        c.cleanDays = [];
        c.due = day;
        c.stage = 0;
      }
      c.rushing = c.slips >= 3 && c.slipDays.length >= 1;
      marked.add(mk.concept);
    }
  }

  if (meta.hintRung > 0) for (const id of problem.concepts) touch(id).hints++;

  const solved = { ...state.solved };
  if (analysis.verdict === 'solved') {
    if (!solved[problem.id]) solved[problem.id] = day;
    // a clean solve only counts if it was done without being shown the next line
    const independent = meta.hintRung < 3;
    for (const id of problem.concepts) {
      if (marked.has(id) || !independent) continue;
      const c = touch(id);
      c.clean++;
      if (c.outstanding) {
        if (!c.cleanDays.includes(day)) c.cleanDays.push(day);
        if (c.cleanDays.length >= 2) {
          c.outstanding = false;
          c.rushing = false;
          c.stage = 1;
          c.due = addDays(day, INTERVALS[2]);
        } else {
          c.due = addDays(day, INTERVALS[0]);
        }
      } else if (c.due && c.due <= day) {
        c.stage = Math.min(INTERVALS.length - 1, c.stage + 1);
        c.due = addDays(day, INTERVALS[c.stage]);
      }
      if (c.slips > 0 && c.clean >= c.slips + 2) c.rushing = false;
    }
  }

  const record: AttemptRecord = {
    id: `a${now.getTime().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    problemId: problem.id,
    topicId: problem.topicId,
    day,
    at: now.toISOString(),
    kind: problem.kind,
    prompt: problem.prompt,
    given: problem.given,
    source: problem.source,
    concepts: problem.concepts,
    lines: analysis.lines.map((l) => ({ text: l.text, status: l.status, code: l.diag?.code, concept: l.diag?.concept, severity: l.diag?.severity })),
    verdict: analysis.verdict,
    marks,
    hintRung: meta.hintRung,
    approach: analysis.approach,
    steps: analysis.steps,
    cleanSteps: analysis.cleanSteps,
    seconds: Math.round(meta.seconds),
  };
  // keep the log bounded
  const attempts = [...state.attempts, record].slice(-400);
  return { concepts, attempts, solved };
}

export interface QueueItem {
  concept: ConceptId;
  status: ConceptStatus;
  kind: 'gap' | 'pattern' | 'check';
  due: string;
  /** Days from today; ≤ 0 means due now. */
  inDays: number;
  state: ConceptState;
}

/** Everything that is scheduled to come back, soonest first. */
export function reviewQueue(concepts: AppState['concepts'], today: string = dayOf()): QueueItem[] {
  const out: QueueItem[] = [];
  for (const c of Object.values(concepts)) {
    if (!c) continue;
    const status = statusOf(c);
    if (c.outstanding) {
      const due = c.due ?? today;
      out.push({ concept: c.id, status, kind: c.gaps > 0 && c.lastGap ? 'gap' : 'pattern', due, inDays: daysBetween(today, due), state: c });
    } else if (c.rushing) {
      out.push({ concept: c.id, status, kind: 'pattern', due: today, inDays: 0, state: c });
    } else if (c.due && c.clean > 0 && c.gaps > 0) {
      out.push({ concept: c.id, status, kind: 'check', due: c.due, inDays: daysBetween(today, c.due), state: c });
    }
  }
  const rank = { gap: 0, pattern: 1, check: 2 } as const;
  return out.sort((a, b) => a.inDays - b.inDays || rank[a.kind] - rank[b.kind]);
}

export const dueNow = (concepts: AppState['concepts'], today: string = dayOf()): QueueItem[] =>
  reviewQueue(concepts, today).filter((q) => q.inDays <= 0);

export interface Session {
  topicId?: string;
  title: string;
  problems: Problem[];
  /** How many of the problems are scheduled reviews. */
  reviews: number;
  minutes: number;
}

/**
 * Build a practice session for a topic: what is due comes first, then the
 * exercises from the student's own notes, then (if the notes run out)
 * problems written for the topic's concepts.
 */
/** A worked example from the notes as a question to try: its own first line (or title) read as a problem. */
export function exampleProblem(block: Extract<Block, { t: 'example' }>, index: number, topicId: string): Problem | null {
  for (const src of [block.lines[0], block.title, `${block.lines[0] ?? ''} ${block.lines[1] ?? ''}`]) {
    const found = src ? parseExercises(plain(src), undefined, topicId).problems[0] : undefined;
    if (found) return { ...found, id: `${topicId}:ex${index}`, source: 'notes' };
  }
  return null;
}

/**
 * Everything in a lesson that can be practised, and nothing that is not in the file: its exercises (those from
 * the notes, then any Lera was asked to write for it), then its worked examples as questions.
 * Written-answer problems only count when an AI model is there to check them.
 */
export function topicProblems(topic: Topic, withOpen: boolean): Problem[] {
  const out: Problem[] = [];
  const seen = new Set<string>();
  const add = (p: Problem) => {
    const key = p.kind === 'open' ? `open:${p.prompt}` : `${p.kind}:${p.given}`;
    if (seen.has(key) || (p.kind === 'open' && !withOpen)) return;
    seen.add(key);
    out.push(p);
  };
  topic.exercises.forEach(add);
  topic.blocks.forEach((b, i) => {
    const p = b.t === 'example' ? exampleProblem(b, i, topic.id) : null;
    if (p && p.kind !== 'open') add(p);
  });
  return out;
}

export function buildSession(
  state: Pick<AppState, 'concepts' | 'solved' | 'profile'> & Partial<Pick<AppState, 'ai'>>,
  topic: Topic | null,
  opts: { today?: string; size?: number; seed?: number } = {},
): Session {
  const today = opts.today ?? dayOf();
  const size = opts.size ?? Math.max(3, Math.min(8, Math.round((state.profile.focusMinutes || 10) / 3)));
  const seed = opts.seed ?? seedFrom(`${today}:${topic?.id ?? 'review'}`);
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const push = (p: Problem) => {
    const key = `${p.kind}:${p.given}`;
    if (seen.has(key) || problems.length >= size) return;
    seen.add(key);
    problems.push(p);
  };

  // 1. what is due — at most two, or the whole session when there is no topic
  const due = dueNow(state.concepts, today);
  const reviewSlots = topic ? Math.min(2, due.length) : Math.min(size, Math.max(due.length * 2, 0));
  let reviews = 0;
  due.slice(0, topic ? 2 : size).forEach((q, i) => {
    const count = topic ? 1 : 2;
    for (const p of practiceFor(q.concept, count, seed + i * 101, 'review')) {
      if (reviews >= reviewSlots) break;
      push(p);
      reviews++;
    }
  });

  if (topic) {
    // a lesson's practice is the lesson's own: what the file has, unsolved first. Nothing is made up to fill it.
    problems.length = 0;
    reviews = 0;
    const own = topicProblems(topic, !!state.ai && state.ai.provider !== 'none');
    for (const e of [...own.filter((e) => !state.solved[e.id]), ...own.filter((e) => state.solved[e.id])]) push(e);
  }

  const minutes = Math.max(2, Math.round(problems.length * 1.4));
  return {
    topicId: topic?.id,
    title: topic?.title ?? tr('Review'),
    problems,
    reviews,
    minutes,
  };
}

/* ───────────── summaries for the screens ───────────── */

export function streak(attempts: AttemptRecord[], today: string = dayOf()): number {
  const days = new Set(attempts.map((a) => a.day));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function topicMastery(topic: Topic, state: Pick<AppState, 'concepts' | 'solved'>): number {
  const own = topic.exercises.filter((e) => e.kind !== 'open');
  const exFrac = own.length ? own.filter((e) => state.solved[e.id]).length / own.length : null;
  const score = (id: ConceptId) => {
    const s = statusOf(state.concepts[id]);
    return s === 'solid' ? 1 : s === 'shaky' ? 0.5 : 0;
  };
  const conceptAvg = topic.concepts.length ? topic.concepts.reduce((s, id) => s + score(id), 0) / topic.concepts.length : 0;
  return exFrac === null ? conceptAvg : 0.6 * exFrac + 0.4 * conceptAvg;
}

export function docMastery(doc: LeraDoc, state: Pick<AppState, 'concepts' | 'solved'>): number {
  const topics = doc.units.flatMap((u) => u.topics);
  if (!topics.length) return 0;
  return topics.reduce((s, t) => s + topicMastery(t, state), 0) / topics.length;
}

export type TopicStatus = 'new' | 'gap' | 'shaky' | 'solid';

export function topicStatus(topic: Topic, state: Pick<AppState, 'concepts' | 'solved'>): TopicStatus {
  const statuses = topic.concepts.map((id) => statusOf(state.concepts[id]));
  if (statuses.includes('gap')) return 'gap';
  const m = topicMastery(topic, state);
  if (m >= 0.85) return 'solid';
  if (m > 0 || statuses.includes('shaky')) return 'shaky';
  return 'new';
}

export interface DaySummary {
  day: string;
  problems: number;
  solved: number;
  gaps: number;
  slips: number;
  lines: number;
  seconds: number;
}

export function byDay(attempts: AttemptRecord[]): DaySummary[] {
  const map = new Map<string, DaySummary>();
  for (const a of attempts) {
    const d = map.get(a.day) ?? { day: a.day, problems: 0, solved: 0, gaps: 0, slips: 0, lines: 0, seconds: 0 };
    d.problems++;
    if (a.verdict === 'solved') d.solved++;
    d.gaps += a.marks.filter((m) => m.severity === 'gap').length;
    d.slips += a.marks.filter((m) => m.severity === 'slip').length;
    d.lines += a.lines.length;
    d.seconds += a.seconds;
    map.set(a.day, d);
  }
  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

export interface Insight {
  tone: 'slip' | 'strategy' | 'ok' | 'gap';
  text: string;
}

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

/** A few plain sentences about how this learner works — derived only from what they actually did. */
export function insights(state: Pick<AppState, 'attempts' | 'concepts'>): Insight[] {
  const out: Insight[] = [];
  const attempts = state.attempts;
  if (attempts.length === 0) return out;

  // where slips land
  const slipLines = attempts.flatMap((a) => a.marks.filter((m) => m.severity === 'slip').map((m) => m.line));
  if (slipLines.length >= 3) {
    const tally = new Map<number, number>();
    slipLines.forEach((i) => tally.set(i, (tally.get(i) ?? 0) + 1));
    const [line, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    if (count / slipLines.length >= 0.55 && line < ORDINAL.length) {
      out.push({ tone: 'slip', text: tr('Your slips cluster on the **{0} line** of a problem, you speed up once you think you’ve seen it.', { 0: ORDINAL[line] }) });
    }
  }

  // favourite approach
  const approaches = new Map<string, number>();
  attempts.forEach((a) => a.approach && approaches.set(a.approach, (approaches.get(a.approach) ?? 0) + 1));
  const total = [...approaches.values()].reduce((s, n) => s + n, 0);
  const top = [...approaches.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && total >= 3 && top[1] / total >= 0.6) {
    out.push({ tone: 'strategy', text: tr('You reach for **{0}** most of the time ({1} of {2}). It works, just make sure it’s a choice, not a habit.', { 0: top[0], 1: top[1], 2: total }) });
  }

  // the weakest spot
  const worst = Object.values(state.concepts)
    .filter((c): c is ConceptState => !!c && c.outstanding && c.gaps > 0)
    .sort((a, b) => b.gaps - a.gaps)[0];
  if (worst) {
    out.push({ tone: 'gap', text: worst.gaps === 1 ? tr('**{0}** has been marked once. That’s the one thing worth your time right now.', { 0: conceptOf(worst.id).title }) : tr('**{0}** has been marked {1} times. That’s the one thing worth your time right now.', { 0: conceptOf(worst.id).title, 1: worst.gaps }) });
  }

  // hints (nothing is ever said about how many lines someone writes: any valid route is a good one)
  const hinted = attempts.filter((a) => a.hintRung > 0);
  if (hinted.length >= 2) {
    const avg = hinted.reduce((s, a) => s + a.hintRung, 0) / hinted.length;
    if (avg <= 1.5) out.push({ tone: 'ok', text: tr('When you’re stuck, a nudge is usually enough, you rarely need to be shown the line.') });
  }
  const gaps = attempts.reduce((s, a) => s + a.marks.filter((m) => m.severity === 'gap').length, 0);
  const slips = attempts.reduce((s, a) => s + a.marks.filter((m) => m.severity === 'slip').length, 0);
  if (out.length < 2 && gaps + slips >= 3 && slips > gaps * 2) {
    out.push({ tone: 'slip', text: tr('Most of your marks ({0} of {1}) are slips, not gaps. You know this material; slow the last line down.', { 0: slips, 1: gaps + slips }) });
  }
  if (out.length === 0 && attempts.length >= 2) {
    const clean = attempts.filter((a) => a.verdict === 'solved' && a.marks.length === 0).length;
    out.push({ tone: 'ok', text: `${clean} of your ${attempts.length} problems were clean from first line to last.` });
  }
  return out.slice(0, 4);
}

export function findTopic(docs: LeraDoc[], topicId: string | undefined): { doc: LeraDoc; unit: LeraDoc['units'][number]; topic: Topic } | null {
  if (!topicId) return null;
  for (const doc of docs) for (const unit of doc.units) for (const topic of unit.topics) if (topic.id === topicId) return { doc, unit, topic };
  return null;
}
