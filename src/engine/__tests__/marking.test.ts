import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, answerOf, cleanPath } from '../analyze';
import { ALL_CONCEPTS, practiceFor } from '../generate';
import { buildCalcProblem } from '../../ingest/calc';
import { confirmsStep, isCalc } from '../calc/check';
import { Problem, ProblemKind } from '../types';
import { recordAttempt } from '../../store/learner';
import { xpOf } from '../../store/game';
import { AppState } from '../../store/types';

/**
 * Marking is about principles, never about length: a line that has done part of a rule and is finished on a
 * later line is a step, not a mistake. And every worked route is shown in its smallest steps, each one true.
 */

const P = (kind: ProblemKind, given: string): Problem => ({ id: given, kind, prompt: '', given, concepts: [], source: 'generated', variable: 'x' });
const statuses = (p: Problem, lines: string[], done = true) => analyze(p, lines, { done }).lines.map((l) => l.status);

/* ───────────── marking ───────────── */

test('a correct step-by-step integral is never flagged', () => {
  const p = P('integral', '∫ 3x^2 dx');
  const a = analyze(p, ['3x^(2+1)', '3x^3/3', 'x^3 + C'], { done: true });
  assert.equal(a.verdict, 'solved');
  assert.deepEqual(a.lines.map((l) => l.status), ['step', 'ok', 'ok']);
  assert.equal(a.marks.length, 0);
});

test('a half-done rule left unfinished at "Done" is the gap, and its fix is that same line corrected', () => {
  const p = P('integral', '∫ 3x^2 dx');
  const a = analyze(p, ['3x^(2+1)'], { done: true });
  assert.notEqual(a.verdict, 'solved');
  assert.equal(a.marks.length, 1);
  assert.equal(a.marks[0].title, 'Divide by the new power.');
  assert.ok(['3x^3/3', 'x^3', '3(x^3/3)'].includes((a.marks[0].fix ?? '').replace(/\s+/g, '')), a.marks[0].fix);
});

test('while still writing, a half-done line is a step with a note on what is left', () => {
  const p = P('integral', '∫ 3x^2 dx');
  const a = analyze(p, ['3x^(2+1)'], { done: false });
  assert.equal(a.lines[0].status, 'step');
  assert.ok(a.lines[0].note && a.lines[0].note.length > 0);
  assert.equal(a.marks.length, 0);
});

test('lines that keep the integral sign are judged as before', () => {
  assert.deepEqual(statuses(P('integral', '∫ 3x^2 dx'), ['3 ∫ x^2 dx', '3 * x^3/3 + C', 'x^3 + C']), ['ok', 'ok', 'ok']);
});

test('differentiating instead of integrating is wrong at once', () => {
  assert.deepEqual(statuses(P('integral', '∫ 3x^2 dx'), ['6x'], false), ['wrong']);
});

test('the chain rule written in two steps is not flagged, and left half-done it is', () => {
  const p = P('derivative', 'd/dx(sin(x^2))');
  const a = analyze(p, ['cos(x^2)', 'cos(x^2) * 2x'], { done: true });
  assert.deepEqual(a.lines.map((l) => l.status), ['step', 'ok']);
  assert.equal(a.marks.length, 0);
  const b = analyze(p, ['cos(x^2)'], { done: true });
  assert.equal(b.marks[0]?.code, 'chain-missing');
});

test('a broken rule is wrong at once, even while writing', () => {
  assert.deepEqual(statuses(P('derivative', 'd/dx(x^2 sin(x))'), ['2x cos(x)'], false), ['wrong']);
});

test('a long, correct solution of an equation gets no marks and no remark about length', () => {
  const p: Problem = { id: 'l', kind: 'linear', prompt: 'Solve for x', given: '2(x + 3) = 14', concepts: ['distributive'], source: 'generated', variable: 'x' };
  const lines = ['2(x + 3) = 14', '2x + 6 = 14', '2x + 6 - 6 = 14 - 6', '2x + 0 = 8', '2x = 8', '2x/2 = 8/2', '1x = 4', 'x = 4', 'x = 4', 'x = 4'];
  const a = analyze(p, lines, { done: true });
  assert.equal(a.verdict, 'solved');
  assert.equal(a.marks.length, 0);
});

test('a step line costs nothing: same points, same clean count, nothing to review', () => {
  const p: Problem = { ...P('integral', '∫ 3x^2 dx'), concepts: ['antiderivatives'] };
  const blank = (): Pick<AppState, 'concepts' | 'attempts' | 'solved'> => ({ concepts: {}, attempts: [], solved: {} });
  const now = new Date('2026-11-17T10:00:00');
  const steps = recordAttempt(blank(), p, analyze(p, ['3x^(2+1)', '3x^3/3', 'x^3 + C'], { done: true }), { hintRung: 0, seconds: 30, now });
  const short = recordAttempt(blank(), p, analyze(p, ['x^3 + C'], { done: true }), { hintRung: 0, seconds: 30, now });
  assert.equal(xpOf(steps.attempts[steps.attempts.length - 1]), xpOf(short.attempts[short.attempts.length - 1]));
  assert.deepEqual(steps.concepts, short.concepts);
});

/* ───────────── explanations ───────────── */

/** Every route line that stands for the whole problem must be true to it. */
function checkRoute(p: Problem): void {
  const route = cleanPath(p);
  assert.ok(route.length >= 2, `route too short for ${p.given}: ${route.map((s) => s.line).join(' | ')}`);
  for (const s of route) {
    if (s.aside) continue;
    const a = analyze(p, [s.line], { done: false });
    assert.ok(['ok', 'step'].includes(a.lines[0]?.status ?? ''), `${p.given}: route line "${s.line}" is ${a.lines[0]?.status}`);
  }
  assert.equal(route[route.length - 1].line, answerOf(p));
}

test('every calculus route is in small steps and every line of it is true (200 seeds)', () => {
  for (const c of ALL_CONCEPTS) {
    for (let seed = 1; seed <= 200; seed++) {
      for (const p of practiceFor(c, 1, seed)) if (isCalc(p.kind)) checkRoute(p);
    }
  }
});

test('∫ 3x^2 dx is explained: constant out, the rule, n = 2, tidied, + C', () => {
  const route = cleanPath(P('integral', '∫ 3x^2 dx'));
  const lines = route.map((s) => s.line.replace(/\s+/g, ''));
  assert.ok(lines.includes('3∫x^2dx'), lines.join(' | '));
  assert.ok(route.some((s) => /n = 2/.test(s.why)), 'says what n is');
  assert.ok(route.some((s) => s.rule), 'states the rule in general');
  assert.ok(lines.includes('x^3'), lines.join(' | '));
  assert.equal(lines[lines.length - 1], 'x^3+C');
});

test('∫ x e^(2x) dx is explained by parts, in steps', () => {
  const route = cleanPath(P('integral', '∫ x e^(2x) dx'));
  const text = route.map((s) => `${s.line} :: ${s.why}`).join('\n');
  assert.ok(route.length >= 5, text);
  assert.ok(route.some((s) => /^u = x$/.test(s.line.trim())), text);
  assert.ok(route.some((s) => /^dv = /.test(s.line.trim())), text);
  assert.ok(route.some((s) => /^du = /.test(s.line.trim())), text);
  assert.ok(route.some((s) => /^v = /.test(s.line.trim())), text);
  assert.ok(route.some((s) => s.rule && /uv/.test(s.rule)), text);
});

test('∫ from 0 to 2 of 3x^2 is explained: antiderivative, top, bottom, subtract', () => {
  const route = cleanPath(P('definite', '∫[0,2] 3x^2 dx'));
  const text = route.map((s) => s.line).join(' | ');
  assert.ok(route.length >= 5, text);
  assert.ok(route.some((s) => /8/.test(s.line) && s.aside), text);
  assert.equal(route[route.length - 1].line, '8');
});

/* ───────────── reading questions ───────────── */

test.todo('"the integral of …" in words is read as an integral', () => {
  const p = buildCalcProblem('Evaluate the integral of 2x cos(x^2). Let u = x^2, du = 2x dx.', undefined, 't', '');
  assert.equal(p?.kind, 'integral');
  assert.equal(p?.given.replace(/\s+/g, ''), '∫2xcos(x^2)dx');
});

test('"the derivative of …" in words is read as a derivative', () => {
  assert.equal(buildCalcProblem('Find the derivative of x^2 sin(x).', undefined, 't', '')?.kind, 'derivative');
});

test('a proof stays a written answer', () => {
  const p = buildCalcProblem('Show that the harmonic series diverges.', undefined, 't', '');
  assert.ok(!p || p.kind === 'open');
});

/* ───────────── the AI's reading of a line ───────────── */

test('the AI can only call a line a step when the checker finds its completed form true', () => {
  const p = P('integral', '∫ 3x^2 dx');
  assert.equal(confirmsStep(p, 'x^3 + C'), true);
  assert.equal(confirmsStep(p, '3x^3'), false);
  assert.equal(confirmsStep(p, ''), false);
  assert.equal(confirmsStep(p, 'hello'), false);
});

test('a line the checker could not name becomes a step only with a confirmed AI reading, and is still marked if never finished', () => {
  const p = P('integral', '∫ 3x^2 dx');
  const odd = '5x^4';
  assert.equal(analyze(p, [odd, 'x^3 + C'], { done: true }).lines[0].status, 'wrong');
  const aiSteps = { [odd]: { note: 'Next: something.', fix: 'x^3' } };
  assert.equal(analyze(p, [odd, 'x^3 + C'], { done: true, aiSteps }).lines[0].status, 'step');
  assert.equal(analyze(p, [odd], { done: true, aiSteps }).lines[0].status, 'wrong');
});
