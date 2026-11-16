import { CONCEPTS } from '../engine/concepts';
import type { ConceptId } from '../engine/types';
import { dayOf, daysBetween, dueNow, statusOf, streak } from './learner';
import type { AppState, AttemptRecord, LearnEvent } from './types';

/**
 * What Lera has learned about how this person studies.
 *
 * Two sources: the attempt log (every problem, every line, every mark) and a
 * short log of other things done in the app (`events`: opening it, reading a
 * lesson, asking for a hint, asking Lera a question, giving only the answer).
 * From those, `learnerModel` works out habits, pace, the kinds of mistake made
 * and what to offer next. Everything here is computed on the phone; nothing is
 * sent anywhere unless a backend is connected (docs/BACKEND.md, section 5),
 * in which case `learnerContext` is the summary a model is given.
 */

export const MAX_EVENTS = 600;

export function withEvent(events: LearnEvent[], t: LearnEvent['t'], data?: LearnEvent['d'], now: Date = new Date()): LearnEvent[] {
  const next = [...events, data ? { at: now.toISOString(), t, d: data } : { at: now.toISOString(), t }];
  return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
const partOfDay = (hour: number): TimeOfDay => (hour >= 5 && hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 22 ? 'evening' : 'night');

export interface LearnerModel {
  /** How much there is to go on: below 5 solved problems most of this is a guess from the onboarding answers. */
  evidence: 'none' | 'little' | 'good';
  habits: {
    /** When practice actually happens, as shares of all practice. */
    byTimeOfDay: Record<TimeOfDay, number>;
    usualTime: TimeOfDay | null;
    /** The hour (0 to 23) most practice starts in. */
    usualHour: number | null;
    daysPerWeek: number;
    /** Minutes of solving on a day that has any. */
    minutesPerDay: number;
    problemsPerDay: number;
    streak: number;
    daysSinceLast: number | null;
  };
  skill: {
    /** Share of the last 20 problems solved with no gap or slip marked. */
    cleanRate: number;
    /** Positive when the last ten went better than the ten before. */
    trend: number;
    /** Median seconds for a solved problem. */
    pace: number | null;
    /** 1 (needs the gentlest problems) to 5 (ready for the hardest). */
    level: 1 | 2 | 3 | 4 | 5;
  };
  style: {
    /** Share of problems where a method hint or more was taken. */
    hintReliance: number;
    /** Share of problems where the solution was shown. */
    revealRate: number;
    /** Slips (knows the rule, fumbled it) against gaps (the rule is missing): which kind of mistake dominates. */
    mistakes: 'careless' | 'conceptual' | 'mixed' | 'few';
    /** Lines written per solved problem against the shortest route: above 1.4 means the long way round. */
    stepsVsShortest: number | null;
    /** Times the answer was given with no working. */
    answerOnly: number;
    /** Questions asked to Lera. */
    questions: number;
  };
  /** The mistakes made most, most frequent first. */
  topErrors: { code: string; concept: ConceptId; title: string; count: number }[];
  weakest: ConceptId[];
  strongest: ConceptId[];
  motivation: { goal?: string; struggle?: string; feel?: number; stage?: string };
  /** Is this person drifting away? */
  risk: 'low' | 'medium' | 'high';
  next: {
    action: 'review' | 'practice-weak' | 'lesson' | 'practice' | 'rest';
    concept?: ConceptId;
    reason: string;
    /** How many problems to offer in one sitting. */
    problems: number;
    /** When a reminder is most likely to land well. */
    remindAt: TimeOfDay;
    /** How Lera should talk: softly, like a coach, or with a dare. */
    tone: 'gentle' | 'coach' | 'challenge';
  };
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};
const marked = (a: AttemptRecord): boolean => a.marks.some((m) => m.severity === 'gap' || m.severity === 'slip');
const clean = (a: AttemptRecord): boolean => a.verdict === 'solved' && !marked(a) && a.hintRung < 3;
const share = (xs: AttemptRecord[], f: (a: AttemptRecord) => boolean): number => (xs.length ? xs.filter(f).length / xs.length : 0);

type Input = Pick<AppState, 'attempts' | 'concepts' | 'profile' | 'events' | 'read'>;

export function learnerModel(s: Input, now: Date = new Date()): LearnerModel {
  const today = dayOf(now);
  const attempts = s.attempts;
  const recent = attempts.slice(-40);
  const events = s.events ?? [];

  // habits
  const hours = new Array<number>(24).fill(0);
  for (const a of attempts) hours[new Date(a.at).getHours()] += 1;
  const byTimeOfDay: Record<TimeOfDay, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  hours.forEach((n, h) => (byTimeOfDay[partOfDay(h)] += n));
  const total = attempts.length || 1;
  (Object.keys(byTimeOfDay) as TimeOfDay[]).forEach((k) => (byTimeOfDay[k] = Math.round((byTimeOfDay[k] / total) * 100) / 100));
  const usualTime = attempts.length >= 3 ? (Object.keys(byTimeOfDay) as TimeOfDay[]).reduce((a, b) => (byTimeOfDay[b] > byTimeOfDay[a] ? b : a)) : null;
  const usualHour = attempts.length >= 3 ? hours.indexOf(Math.max(...hours)) : null;
  const days = new Map<string, AttemptRecord[]>();
  for (const a of attempts) days.set(a.day, [...(days.get(a.day) ?? []), a]);
  const last28 = [...days.keys()].filter((d) => daysBetween(d, today) < 28);
  const firstDay = attempts[0]?.day;
  const weeks = firstDay ? Math.max(1, Math.min(4, (daysBetween(firstDay, today) + 1) / 7)) : 1;
  const activeDays = [...days.values()];
  const lastDay = attempts.length ? attempts[attempts.length - 1].day : null;

  // skill
  const last20 = attempts.slice(-20);
  const cleanRate = share(last20, clean);
  const trend = attempts.length >= 12 ? share(attempts.slice(-10), clean) - share(attempts.slice(-20, -10), clean) : 0;
  const pace = median(recent.filter((a) => a.verdict === 'solved').map((a) => a.seconds));
  const hintReliance = share(recent, (a) => a.hintRung >= 2);
  const revealRate = share(recent, (a) => a.verdict !== 'solved' || a.hintRung >= 3);
  let level = 3;
  if (attempts.length >= 5) {
    level = cleanRate >= 0.85 ? 5 : cleanRate >= 0.65 ? 4 : cleanRate >= 0.4 ? 3 : cleanRate >= 0.2 ? 2 : 1;
    if (hintReliance > 0.5 && level > 1) level -= 1;
  } else if (s.profile.feel !== undefined) level = [1, 2, 3, 4][s.profile.feel] ?? 3;

  // style
  const gaps = recent.reduce((n, a) => n + a.marks.filter((m) => m.severity === 'gap').length, 0);
  const slips = recent.reduce((n, a) => n + a.marks.filter((m) => m.severity === 'slip').length, 0);
  const mistakes: LearnerModel['style']['mistakes'] = gaps + slips < 3 ? 'few' : slips >= gaps * 2 ? 'careless' : gaps >= slips * 2 ? 'conceptual' : 'mixed';
  const solved = recent.filter((a) => a.verdict === 'solved' && a.cleanSteps > 0);
  const stepsVsShortest = solved.length >= 3 ? Math.round((solved.reduce((n, a) => n + a.steps / a.cleanSteps, 0) / solved.length) * 100) / 100 : null;

  const tally = new Map<string, { code: string; concept: ConceptId; title: string; count: number }>();
  for (const a of recent) {
    for (const m of a.marks) {
      if (m.severity !== 'gap' && m.severity !== 'slip') continue;
      const key = `${m.code}:${m.concept}`;
      const row = tally.get(key) ?? { code: m.code, concept: m.concept, title: m.title.replace(/\*\*/g, ''), count: 0 };
      row.count += 1;
      tally.set(key, row);
    }
  }
  const topErrors = [...tally.values()].sort((a, b) => b.count - a.count).slice(0, 5);

  const ids = Object.keys(s.concepts) as ConceptId[];
  const weakest = ids.filter((c) => statusOf(s.concepts[c]) === 'gap').slice(0, 4);
  const strongest = ids.filter((c) => statusOf(s.concepts[c]) === 'solid').slice(0, 4);

  // drifting away?
  const daysSinceLast = lastDay ? daysBetween(lastDay, today) : null;
  const run = streak(attempts, today);
  const lastWeek = [...days.keys()].filter((d) => daysBetween(d, today) < 7).length;
  const weekBefore = [...days.keys()].filter((d) => daysBetween(d, today) >= 7 && daysBetween(d, today) < 14).length;
  const risk: LearnerModel['risk'] = daysSinceLast === null ? 'medium' : daysSinceLast >= 4 ? 'high' : daysSinceLast >= 2 || (weekBefore >= 3 && lastWeek <= weekBefore - 2) ? 'medium' : 'low';

  // what to offer next
  const due = dueNow(s.concepts, today);
  const doneToday = days.has(today);
  const todayXp = (days.get(today) ?? []).filter((a) => a.verdict === 'solved').length * 10;
  const tone: LearnerModel['next']['tone'] = (s.profile.feel ?? 2) <= 1 || trend < -0.2 || risk === 'high' ? 'gentle' : level >= 4 && trend >= 0 ? 'challenge' : 'coach';
  const problems = Math.max(2, Math.min(6, Math.round(pace ? ((s.profile.focusMinutes || 10) * 60) / Math.max(45, pace) : 4)));
  const remindAt = usualTime ?? ((s.profile.studyTime as TimeOfDay | undefined) ?? 'evening');
  let action: LearnerModel['next']['action'] = 'practice';
  let reason = 'A short set keeps the habit going.';
  let concept: ConceptId | undefined;
  if (doneToday && todayXp >= (s.profile.dailyXp || 30)) {
    action = 'rest';
    reason = 'Today’s goal is done. Rest is part of learning; come back tomorrow.';
  } else if (due.length) {
    action = 'review';
    concept = due[0].concept;
    reason = `${CONCEPTS[concept].title} is due to come back, before it fades.`;
  } else if (weakest.length) {
    action = 'practice-weak';
    concept = weakest[0];
    reason = `${CONCEPTS[concept].title} is still a gap.`;
  } else if (attempts.length === 0 || Object.keys(s.read).length === 0) {
    action = 'lesson';
    reason = 'Read a lesson first, then try its problems.';
  }

  return {
    evidence: attempts.length === 0 ? 'none' : attempts.length < 5 ? 'little' : 'good',
    habits: {
      byTimeOfDay,
      usualTime,
      usualHour,
      daysPerWeek: Math.round((last28.length / weeks) * 10) / 10,
      minutesPerDay: Math.round((activeDays.reduce((n, d) => n + d.reduce((k, a) => k + a.seconds, 0), 0) / Math.max(1, activeDays.length) / 60) * 10) / 10,
      problemsPerDay: Math.round((attempts.length / Math.max(1, activeDays.length)) * 10) / 10,
      streak: run,
      daysSinceLast,
    },
    skill: { cleanRate: Math.round(cleanRate * 100) / 100, trend: Math.round(trend * 100) / 100, pace, level: level as LearnerModel['skill']['level'] },
    style: { hintReliance: Math.round(hintReliance * 100) / 100, revealRate: Math.round(revealRate * 100) / 100, mistakes, stepsVsShortest, answerOnly: events.filter((e) => e.t === 'answer_only').length, questions: events.filter((e) => e.t === 'ask').length },
    topErrors,
    weakest,
    strongest,
    motivation: { goal: s.profile.goal, struggle: s.profile.struggle, feel: s.profile.feel, stage: s.profile.stage },
    risk,
    next: { action, concept, reason, problems, remindAt, tone },
  };
}

/** A few lines for a model's system prompt: who it is talking to and how to pitch what it says. No name, no email. */
export function learnerContext(s: Input, now: Date = new Date()): string {
  const m = learnerModel(s, now);
  const lines = [
    `Level ${m.skill.level}/5; ${Math.round(m.skill.cleanRate * 100)}% of recent problems solved cleanly${m.skill.trend ? ` (${m.skill.trend > 0 ? 'improving' : 'slipping'})` : ''}.`,
    m.style.mistakes === 'careless' ? 'Mistakes are mostly slips: knows the rules, loses signs and arithmetic. Ask for one more check, do not re-teach.' : m.style.mistakes === 'conceptual' ? 'Mistakes are mostly gaps: a rule is missing. Explain the rule from the start, with one small example.' : '',
    m.topErrors.length ? `Most frequent mistakes: ${m.topErrors.slice(0, 3).map((e) => `${e.title} (${e.count}x)`).join('; ')}.` : '',
    m.weakest.length ? `Open gaps: ${m.weakest.map((c) => CONCEPTS[c].title).join(', ')}.` : '',
    m.style.hintReliance > 0.4 ? 'Leans on hints: give a nudge and a question, not the next line.' : '',
    m.style.answerOnly >= 3 ? 'Often gives only the answer: ask to see the working.' : '',
    m.motivation.goal ? `Why they are here: ${m.motivation.goal}.` : '',
    m.motivation.struggle ? `Says they struggle with: ${m.motivation.struggle}.` : '',
    `Tone: ${m.next.tone === 'gentle' ? 'gentle and reassuring; small steps' : m.next.tone === 'challenge' ? 'brisk; offer the harder route' : 'like a coach: direct, warm'}.`,
  ];
  return lines.filter(Boolean).join('\n');
}

export interface Quest {
  id: string;
  title: string;
  done: number;
  of: number;
  icon: string;
}

/**
 * Three small things for today, picked from the model: one about showing up, one aimed at the weakest
 * spot, one at the habit most worth changing. They are finished within a day and then they stop.
 */
export function dailyQuests(s: Input, now: Date = new Date()): Quest[] {
  const m = learnerModel(s, now);
  const today = dayOf(now);
  const mine = s.attempts.filter((a) => a.day === today);
  const solvedToday = mine.filter((a) => a.verdict === 'solved');
  const n = Math.max(2, Math.min(5, m.next.problems - 1));
  const quests: Quest[] = [{ id: 'solve', title: `Solve ${n} problems`, done: Math.min(n, solvedToday.length), of: n, icon: 'pencil' }];
  const target = dueNow(s.concepts, today)[0]?.concept ?? m.weakest[0];
  if (target) quests.push({ id: 'weak', title: `One clean solve: ${CONCEPTS[target].title}`, done: mine.some((a) => clean(a) && a.concepts.includes(target)) ? 1 : 0, of: 1, icon: 'target' });
  else quests.push({ id: 'read', title: 'Read one lesson', done: Object.values(s.read).includes(today) ? 1 : 0, of: 1, icon: 'book' });
  if (m.style.hintReliance > 0.4) quests.push({ id: 'nohint', title: 'Solve one with no hints', done: solvedToday.some((a) => a.hintRung === 0) ? 1 : 0, of: 1, icon: 'bulb' });
  else if (m.style.mistakes === 'careless') quests.push({ id: 'clean', title: 'One solution with every line clean', done: mine.some(clean) ? 1 : 0, of: 1, icon: 'check' });
  else quests.push({ id: 'streak', title: m.habits.streak > 1 ? `Keep your ${m.habits.streak}-day streak` : 'Start a streak', done: mine.length ? 1 : 0, of: 1, icon: 'flame' });
  return quests;
}
