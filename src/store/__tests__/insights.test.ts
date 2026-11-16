import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyQuests, learnerContext, learnerModel, MAX_EVENTS, withEvent } from '../insights';
import type { AppState, AttemptRecord } from '../types';

const NOW = new Date('2026-11-16T19:30:00');
const attempt = (day: string, hour: number, over: Partial<AttemptRecord> = {}): AttemptRecord => ({
  id: `${day}-${hour}-${Math.random()}`, problemId: 'p', day, at: new Date(`${day}T${String(hour).padStart(2, '0')}:10:00`).toISOString(), kind: 'linear', prompt: 'Solve', given: '3x + 4 = 19',
  source: 'generated', concepts: ['inverse-operations'], lines: [], verdict: 'solved', marks: [], hintRung: 0, steps: 3, cleanSteps: 3, seconds: 80, ...over,
});
const base = (attempts: AttemptRecord[]): Pick<AppState, 'attempts' | 'concepts' | 'profile' | 'events' | 'read'> => ({
  attempts, concepts: {}, events: [], read: {},
  profile: { name: 'Eko', email: 'eko@example.com', language: 'en', focusMinutes: 10, subjects: ['algebra'], dailyXp: 30, checkMode: 'line', notifications: false, plan: 'none', onboarded: true, feel: 1, goal: 'I have an exam coming' } as AppState['profile'],
});
const slip = { code: 'sign-move', concept: 'inverse-operations' as const, severity: 'slip' as const, title: 'The sign didn’t change', line: 1 };

test('with nothing to go on, the model leans on the onboarding answers', () => {
  const m = learnerModel(base([]), NOW);
  assert.equal(m.evidence, 'none');
  assert.equal(m.skill.level, 2, 'said maths feels shaky');
  assert.equal(m.next.tone, 'gentle');
  assert.equal(m.next.action, 'lesson');
  assert.equal(m.habits.usualTime, null);
});

test('habits, pace and the kind of mistake come from the attempt log', () => {
  const log = [
    ...['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'].flatMap((d) => [attempt(d, 19, { marks: [slip] }), attempt(d, 20)]),
    attempt('2026-11-16', 19, { hintRung: 2 }),
  ];
  const m = learnerModel(base(log), NOW);
  assert.equal(m.evidence, 'good');
  assert.equal(m.habits.usualTime, 'evening');
  assert.equal(m.habits.usualHour, 19);
  assert.equal(m.habits.streak, 7);
  assert.equal(m.skill.pace, 80);
  assert.equal(m.style.mistakes, 'careless');
  assert.equal(m.topErrors[0].code, 'sign-move');
  assert.equal(m.risk, 'low');
  assert.equal(m.next.remindAt, 'evening');
});

test('someone who has stopped coming is flagged, and spoken to gently', () => {
  const m = learnerModel(base([attempt('2026-11-05', 9), attempt('2026-11-06', 9), attempt('2026-11-07', 9)]), NOW);
  assert.equal(m.risk, 'high');
  assert.equal(m.next.tone, 'gentle');
  assert.equal(m.habits.daysSinceLast, 9);
});

test('the summary for a model carries no name or email', () => {
  const text = learnerContext(base([attempt('2026-11-15', 19, { marks: [slip] }), attempt('2026-11-16', 19, { marks: [slip] }), attempt('2026-11-16', 19, { marks: [slip] })]), NOW);
  assert.ok(!/eko/i.test(text));
  assert.match(text, /exam/);
  assert.match(text, /Tone:/);
});

test('quests are three, about today, and tick off as the work is done', () => {
  const before = dailyQuests(base([attempt('2026-11-15', 19)]), NOW);
  assert.equal(before.length, 3);
  assert.ok(before.every((q) => q.done === 0));
  const after = dailyQuests(base([attempt('2026-11-15', 19), attempt('2026-11-16', 18), attempt('2026-11-16', 19)]), NOW);
  assert.ok(after[0].done >= 2);
  assert.equal(after[2].done, 1);
});

test('the event log is bounded', () => {
  let events = withEvent([], 'open');
  for (let i = 0; i < MAX_EVENTS + 50; i++) events = withEvent(events, 'hint', { rung: 1 });
  assert.equal(events.length, MAX_EVENTS);
  assert.equal(events[events.length - 1].t, 'hint');
});
