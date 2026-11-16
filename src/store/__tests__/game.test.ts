import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../engine/analyze';
import { Problem, ProblemKind } from '../../engine/types';
import { levelOf, longestStreak, totalXp } from '../game';
import { recordAttempt } from '../learner';
import { AppState } from '../types';
import { weaknesses } from '../weakness';

const P = (kind: ProblemKind, given: string, concept: Problem['concepts'][number], topicId?: string): Problem => ({ id: given, kind, prompt: '', given, concepts: [concept], source: 'generated', variable: 'x', topicId });

test('levels and streaks come from the practice log', () => {
  let st: Pick<AppState, 'concepts' | 'attempts' | 'solved'> = { concepts: {}, attempts: [], solved: {} };
  const rec = (p: Problem, lines: string[], day: string) => {
    st = recordAttempt(st, p, analyze(p, lines), { hintRung: 0, seconds: 40, now: new Date(`${day}T10:00:00`) });
  };
  rec(P('derivative', 'd/dx(x^3)', 'power-rule'), ['3x^2'], '2026-03-01');
  rec(P('derivative', 'd/dx(x^4)', 'power-rule'), ['4x^3'], '2026-03-02');
  rec(P('derivative', 'd/dx(x^5)', 'power-rule'), ['5x^4'], '2026-03-04');
  assert.equal(longestStreak(st.attempts), 2);
  assert.equal(totalXp({ attempts: st.attempts, read: {} }), 51);
  assert.equal(levelOf(51).level, 2);
});

test('a gap whose prerequisite is shaky points at the earlier idea, and at the lesson that teaches it', () => {
  let st: Pick<AppState, 'concepts' | 'attempts' | 'solved'> = { concepts: {}, attempts: [], solved: {} };
  const rec = (p: Problem, lines: string[]) => {
    st = recordAttempt(st, p, analyze(p, lines), { hintRung: 0, seconds: 40, now: new Date('2026-03-01T10:00:00') });
  };
  rec(P('derivative', 'd/dx(sin(3x))', 'chain-rule', 'tc'), ['cos(3x)']);
  rec(P('integral', '∫ cos(3x) dx', 'u-substitution', 'tc'), ['sin(3x) + C']);
  const docs = [{ id: 'd', title: 'Notes', fileName: 'n.pdf', kind: 'pdf' as const, addedAt: '', glossary: {}, via: 'local' as const, warnings: [], units: [{ id: 'u', title: 'U', topics: [{ id: 'tc', title: 'The chain rule', blocks: [{ t: 'p' as const, text: 'x' }], exercises: [], concepts: ['chain-rule' as const] }] }] }];
  const found = weaknesses({ attempts: st.attempts, concepts: st.concepts, docs }, '2026-03-01');
  assert.ok(found.some((w) => w.kind === 'gap' && w.concept === 'chain-rule' && w.action.type === 'lesson' && w.action.topicId === 'tc'));
  assert.ok(found.some((w) => w.kind === 'root' && w.concept === 'chain-rule'));
});
