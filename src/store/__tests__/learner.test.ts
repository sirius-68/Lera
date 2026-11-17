import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../engine/analyze';
import { Problem } from '../../engine/types';
import { Topic } from '../../ingest/types';
import { addDays, buildSession, byDay, dueNow, insights, recordAttempt, reviewQueue, statusOf, streak, topicMastery } from '../learner';
import { AppState } from '../types';

const empty = (): Pick<AppState, 'concepts' | 'attempts' | 'solved' | 'profile'> => ({
  concepts: {},
  attempts: [],
  solved: {},
  profile: { name: '', email: '', language: 'English', focusMinutes: 15, notifications: false, plan: 'none', onboarded: true },
});

const linear = (id: string, given: string): Problem => ({ id, kind: 'linear', prompt: 'Solve for x', given, concepts: ['inverse-operations'], source: 'notes', topicId: 't1' });
const at = (day: string) => new Date(`${day}T10:00:00`);

function attempt(state: ReturnType<typeof empty>, p: Problem, lines: string[], day: string, hintRung = 0) {
  const next = recordAttempt(state, p, analyze(p, lines), { hintRung, seconds: 60, now: at(day) });
  return { ...state, ...next };
}

test('a gap stays outstanding until two clean days', () => {
  let s = empty();
  s = attempt(s, linear('p1', '3x + 4 = 19'), ['3x = 23', 'x = 23/3'], '2026-11-14');
  const c1 = s.concepts['inverse-operations']!;
  assert.equal(statusOf(c1), 'gap');
  assert.equal(c1.outstanding, true);
  assert.equal(dueNow(s.concepts, '2026-11-14').length, 1);

  // a clean solve the same day: still outstanding, comes back tomorrow
  s = attempt(s, linear('p2', '2x + 6 = 10'), ['2x = 4', 'x = 2'], '2026-11-14');
  assert.equal(statusOf(s.concepts['inverse-operations']), 'shaky');
  assert.equal(s.concepts['inverse-operations']!.due, '2026-11-15');
  assert.equal(dueNow(s.concepts, '2026-11-14').length, 0);
  assert.equal(dueNow(s.concepts, '2026-11-15').length, 1);

  // a second clean solve on the SAME day does not clear it
  s = attempt(s, linear('p3', 'x + 1 = 5'), ['x = 4'], '2026-11-14');
  assert.equal(s.concepts['inverse-operations']!.outstanding, true);

  // clean again on a different day: cleared, with a retention check a week out
  s = attempt(s, linear('p4', '5x - 5 = 10'), ['5x = 15', 'x = 3'], '2026-11-15');
  const c = s.concepts['inverse-operations']!;
  assert.equal(c.outstanding, false);
  assert.equal(statusOf(c), 'solid');
  assert.equal(c.due, addDays('2026-11-15', 7));
  const q = reviewQueue(s.concepts, '2026-11-15');
  assert.equal(q[0].kind, 'check');
  assert.equal(q[0].inDays, 7);
});

test('being shown the next line does not count as a clean solve', () => {
  let s = empty();
  s = attempt(s, linear('p1', '3x + 4 = 19'), ['3x = 23'], '2026-11-14');
  s = attempt(s, linear('p2', '2x + 6 = 10'), ['2x = 4', 'x = 2'], '2026-11-15', 3);
  assert.equal(s.concepts['inverse-operations']!.cleanDays.length, 0);
});

test('slips are counted but only become a pattern when they recur', () => {
  let s = empty();
  const p = (id: string): Problem => ({ ...linear(id, '3x + 4 = 19'), concepts: ['arithmetic'] });
  s = attempt(s, p('a'), ['3x = 16'], '2026-11-10');
  assert.equal(s.concepts.arithmetic!.outstanding, false);
  assert.equal(statusOf(s.concepts.arithmetic), 'shaky');
  s = attempt(s, p('b'), ['3x = 14'], '2026-11-11');
  s = attempt(s, p('c'), ['3x = 17'], '2026-11-12');
  assert.equal(s.concepts.arithmetic!.rushing, true);
  assert.equal(s.concepts.arithmetic!.outstanding, true, 'three separate days of the same slip becomes a queued item');
  assert.equal(reviewQueue(s.concepts, '2026-11-12')[0].kind, 'pattern');
});

test('a lesson’s session is only what its part of the file has: exercises, then examples', () => {
  let s = empty();
  s = attempt(s, { ...linear('x', '2(x + 3) = 14'), concepts: ['distributive'] }, ['2x + 3 = 14'], '2026-11-14');
  const topic: Topic = {
    id: 't1', title: 'Solving linear equations', concepts: ['inverse-operations'],
    blocks: [{ t: 'p', text: 'Undo what was done to x.' }, { t: 'example', title: 'Example 1', lines: ['Solve 4x + 1 = 9', '4x = 8', 'x = 2'] }],
    exercises: [linear('e1', 'x + 7 = 12'), linear('e2', '3x = 21'), linear('e3', '2x - 5 = 9')],
  };
  const session = buildSession(s, topic, { today: '2026-11-14', size: 8 });
  // no review slipped in, and nothing made up to fill the session
  assert.deepEqual(session.problems.map((p) => p.id), ['e1', 'e2', 'e3', 't1:ex1']);
  assert.equal(session.reviews, 0);
  assert.ok(session.problems.every((p) => p.source === 'notes'));
  assert.equal(session.problems[3].given, '4x + 1 = 9');
  // a lesson whose part of the file has nothing to practise gives an empty session, not someone else's problems
  assert.equal(buildSession(s, { ...topic, blocks: [], exercises: [] }, { today: '2026-11-14' }).problems.length, 0);
  // a review-only session is still made of what is due
  const review = buildSession(s, null, { today: '2026-11-14', size: 4 });
  assert.ok(review.problems.length >= 2 && review.problems.every((p) => p.source === 'review'));
});

test('solved exercises are skipped next time and raise mastery', () => {
  let s = empty();
  const topic: Topic = { id: 't1', title: 'T', blocks: [], concepts: ['inverse-operations'], exercises: [linear('e1', 'x + 7 = 12'), linear('e2', '3x = 21')] };
  assert.equal(topicMastery(topic, s), 0);
  s = attempt(s, topic.exercises[0], ['x = 5'], '2026-11-14');
  assert.ok(Math.abs(topicMastery(topic, s) - (0.6 * 0.5 + 0.4 * 0.5)) < 1e-9);
  const session = buildSession(s, topic, { today: '2026-11-14', size: 3 });
  assert.equal(session.problems[0].id, 'e2');
});

test('streak, day summaries and insights come from real attempts', () => {
  let s = empty();
  s = attempt(s, linear('a', '3x + 4 = 19'), ['3x = 15', 'x = 5'], '2026-11-12');
  s = attempt(s, linear('b', '3x + 4 = 19'), ['3x = 23'], '2026-11-13');
  s = attempt(s, linear('c', '3x + 4 = 19'), ['3x = 15', 'x = 5'], '2026-11-14');
  assert.equal(streak(s.attempts, '2026-11-14'), 3);
  assert.equal(streak(s.attempts, '2026-11-15'), 3, 'yesterday still counts until today is missed');
  assert.equal(streak(s.attempts, '2026-11-16'), 0);
  const days = byDay(s.attempts);
  assert.deepEqual(days.map((d) => d.gaps), [0, 1, 0]);
  const ins = insights(s);
  assert.ok(ins.length >= 1);
  assert.ok(ins.some((i) => /Moving terms/.test(i.text)));
});
