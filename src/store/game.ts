import { ConceptState, AttemptRecord, AppState } from './types';
import { addDays, dayOf, streak } from './learner';

/**
 * Points, levels, goals and badges. Nothing here is stored: it is all worked
 * out from the practice log, so it can never drift from what the learner did.
 */

/** A solve is worth more when it was clean, and more again when it closes a review. */
export const xpOf = (a: AttemptRecord): number => {
  if (a.verdict !== 'solved') return a.lines.length > 0 ? 2 : 0;
  return 10 + (a.marks.length === 0 && a.hintRung < 3 ? 5 : 0) + (a.source === 'review' ? 5 : 0) + (a.hintRung === 0 ? 2 : 0);
};

const READ_XP = 5;

type GameState = Pick<AppState, 'attempts' | 'read'>;

export function xpByDay(state: GameState): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of state.attempts) map.set(a.day, (map.get(a.day) ?? 0) + xpOf(a));
  for (const day of Object.values(state.read)) map.set(day, (map.get(day) ?? 0) + READ_XP);
  return map;
}

export const totalXp = (state: GameState): number => [...xpByDay(state).values()].reduce((s, n) => s + n, 0);

const TITLES = ['Starter', 'Explorer', 'Solver', 'Thinker', 'Analyst', 'Strategist', 'Master', 'Sage'];

export interface Level {
  level: number;
  title: string;
  /** XP earned inside this level, and how much the level needs. */
  into: number;
  need: number;
}

/** Level n starts at 25·n·(n−1) XP: 0, 50, 150, 300, 500 … */
export function levelOf(xp: number): Level {
  let level = 1;
  while (25 * (level + 1) * level <= xp) level++;
  const floor = 25 * level * (level - 1);
  const next = 25 * (level + 1) * level;
  return { level, title: TITLES[Math.min(TITLES.length - 1, level - 1)], into: xp - floor, need: next - floor };
}

export const GOALS = [
  { xp: 15, label: 'Casual', sub: 'about 5 minutes a day' },
  { xp: 30, label: 'Regular', sub: 'about 10 minutes a day' },
  { xp: 50, label: 'Serious', sub: 'about 15 minutes a day' },
  { xp: 80, label: 'Intense', sub: '20 minutes or more' },
];

export function longestStreak(attempts: AttemptRecord[]): number {
  const days = [...new Set(attempts.map((a) => a.day))].sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export interface DayCell {
  day: string;
  label: string;
  xp: number;
  active: boolean;
  today: boolean;
  future: boolean;
}

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Monday-to-Sunday strip for the week that contains `today`. */
export function weekStrip(state: GameState, today: string = dayOf()): DayCell[] {
  const xp = xpByDay(state);
  const d = new Date(`${today}T12:00:00`);
  const monday = addDays(today, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    return { day, label: WEEKDAY[(i + 1) % 7], xp: xp.get(day) ?? 0, active: (xp.get(day) ?? 0) > 0, today: day === today, future: day > today };
  });
}

/** The last five weeks, oldest first, for the calendar on the streak screen. */
export function monthGrid(state: GameState, today: string = dayOf()): DayCell[] {
  const xp = xpByDay(state);
  const d = new Date(`${today}T12:00:00`);
  const end = addDays(today, 6 - ((d.getDay() + 6) % 7));
  return Array.from({ length: 35 }, (_, i) => {
    const day = addDays(end, i - 34);
    return { day, label: String(Number(day.slice(8))), xp: xp.get(day) ?? 0, active: (xp.get(day) ?? 0) > 0, today: day === today, future: day > today };
  });
}

export interface Badge {
  id: string;
  title: string;
  desc: string;
  icon: string;
  tone: 'brand' | 'flame' | 'ok' | 'gold';
  have: number;
  need: number;
  earned: boolean;
}

export function badges(state: Pick<AppState, 'attempts' | 'read' | 'concepts' | 'saved' | 'notes' | 'highlights'>, today: string = dayOf()): Badge[] {
  const a = state.attempts;
  const solved = a.filter((x) => x.verdict === 'solved');
  const clean = solved.filter((x) => x.marks.length === 0 && x.hintRung < 3).length;
  const solo = solved.filter((x) => x.hintRung === 0).length;
  const best = Math.max(longestStreak(a), streak(a, today));
  const closed = Object.values(state.concepts).filter((c): c is ConceptState => !!c && c.gaps > 0 && !c.outstanding).length;
  const comeback = a.filter((x) => x.verdict === 'solved' && x.lines.some((l) => l.status === 'recovered')).length;
  const calc = solved.filter((x) => x.kind === 'derivative' || x.kind === 'integral' || x.kind === 'definite' || x.kind === 'limit').length;
  const kept = state.saved.length + state.notes.length + state.highlights.length;
  const xp = totalXp(state);
  const mk = (id: string, title: string, desc: string, icon: string, tone: Badge['tone'], have: number, need: number): Badge => ({ id, title, desc, icon, tone, have: Math.min(have, need), need, earned: have >= need });
  return [
    mk('first', 'First steps', 'Solve your first problem', 'check', 'ok', solved.length, 1),
    mk('streak3', 'On a roll', 'Practise 3 days in a row', 'flame', 'flame', best, 3),
    mk('clean5', 'Clean sheet', '5 problems with no marks', 'sparkle', 'brand', clean, 5),
    mk('closed', 'Gap closed', 'Fix an idea that was marked as a gap', 'target', 'ok', closed, 1),
    mk('streak7', 'Full week', 'Practise 7 days in a row', 'flame', 'flame', best, 7),
    mk('solo10', 'On my own', '10 solves without a hint', 'bulb', 'gold', solo, 10),
    mk('comeback', 'Comeback', 'Recover after a wrong line', 'refresh', 'brand', comeback, 1),
    mk('reader', 'Bookworm', 'Read 5 lessons', 'book', 'brand', Object.keys(state.read).length, 5),
    mk('keeper', 'Collector', 'Save, highlight or note 5 things', 'bookmark', 'gold', kept, 5),
    mk('calc', 'Rate of change', 'Solve 5 calculus problems', 'chart', 'ok', calc, 5),
    mk('xp500', 'Half a thousand', 'Earn 500 XP', 'sparkle', 'gold', xp, 500),
    mk('streak30', 'Habit', 'Practise 30 days in a row', 'flame', 'flame', best, 30),
  ];
}
