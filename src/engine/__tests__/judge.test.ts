import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../analyze';
import { withJudge } from '../judge';
import { Problem } from '../types';

/** The AI judges every line; the checker's proofs veto it in both directions. */

const p: Problem = { id: 'j', kind: 'integral', prompt: '', given: '∫ 3x^2 dx', concepts: ['antiderivatives'], source: 'notes', variable: 'x' };

test('a line the checker proved right is never marked by the AI, but a habit can still be said', () => {
  const a = analyze(p, ['x^3 + C'], { done: true });
  const j = withJudge(p, a, { 'x^3 + C': { verdict: 'error', note: 'Wrong.', pattern: 'You dropped the dx on the way.' } });
  assert.equal(j.lines[0].status, 'ok');
  assert.equal(j.marks.length, 0);
  assert.equal(j.lines[0].coach, 'You dropped the dx on the way.');
});

test('a line the checker proved wrong is never passed by the AI', () => {
  const a = analyze(p, ['6x'], { done: true });
  const j = withJudge(p, a, { '6x': { verdict: 'ok' } });
  assert.equal(j.lines[0].status, 'wrong');
  assert.equal(j.marks.length, 1);
});

test('when the rules could not name a mistake, the AI names it', () => {
  const a = analyze(p, ['5x^4'], { done: true });
  assert.equal(a.lines[0].diag?.code, 'unknown');
  const j = withJudge(p, a, { '5x^4': { verdict: 'error', title: 'Raise the power, do not lower it.', note: 'You lowered the power.', concept: 'antiderivatives', severity: 'gap' } });
  assert.equal(j.lines[0].diag?.title, 'Raise the power, do not lower it.');
  assert.equal(j.lines[0].diag?.message, 'You lowered the power.');
});

test('where the rules cannot tell, the AI decides', () => {
  const a = analyze(p, ['since cos is an odd function we can drop it', 'x^3 + C'], { done: true });
  assert.equal(a.lines[0].status, 'unchecked');
  const bad = withJudge(p, a, { [a.lines[0].text]: { verdict: 'error', title: 'cos is even, not odd.', note: 'cos(−x) = cos(x), so cos is an even function.', concept: 'trig-derivatives' } });
  assert.equal(bad.lines[0].status, 'wrong');
  assert.equal(bad.marks.length, 1);
  const good = withJudge(p, a, { [a.lines[0].text]: { verdict: 'ok' } });
  assert.equal(good.lines[0].status, 'ok');
  assert.equal(good.lines[0].judge, 'ai');
});

test('without the AI nothing changes', () => {
  const a = analyze(p, ['3x^(2+1)', 'x^3 + C'], { done: true });
  assert.deepEqual(withJudge(p, a, {}), a);
});
