import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, cleanPath, hintLadder } from '../analyze';
import { diff, equiv, ev, parseCalc, simp, toText } from '../calc/expr';
import { integrate } from '../calc/integrate';
import { Problem, ProblemKind } from '../types';

const P = (kind: ProblemKind, given: string): Problem => ({ id: given, kind, prompt: '', given, concepts: [], source: 'generated', variable: 'x' });
const codes = (kind: ProblemKind, given: string, lines: string[]) => analyze(P(kind, given), lines).lines.map((l) => l.diag?.code ?? l.status);

test('calculus notation parses and prints back to the same expression', () => {
  for (const s of ['3x^2 sin x', 'e^(2x) + ln x', 'd/dx(x^3 sin(x))', '∫ 3x² dx', '∫[0,2] x^2 dx', 'lim x→2 (x^2-4)/(x-2)', 'lim x->0 sin x / x', 'sin^2 x', '1/(2sqrt(x))']) {
    const e = parseCalc(s);
    const back = parseCalc(toText(e));
    assert.equal(toText(back), toText(e), s);
  }
});

test('derivatives', () => {
  const d = (s: string) => toText(simp(diff(parseCalc(s), 'x')));
  assert.equal(d('x^3 + 2x^2 - 5x + 7'), '3x^2 + 4x - 5');
  assert.equal(d('sin(3x)'), '3cos(3x)');
  assert.equal(d('x^2 sin x'), '2x sin(x) + x^2 cos(x)');
  assert.equal(d('e^(2x)'), '2e^(2x)');
  assert.equal(d('ln(x^2+1)'), '2x/(x^2 + 1)');
});

test('integrals are confirmed by differentiating', () => {
  for (const s of ['3x^2', '2x + cos x', 'e^(2x)', 'sin(3x)', '(2x+1)^4', '2x(x^2+1)^3', 'x e^x', 'x cos x', 'ln x', 'x/(x^2+1)', '1/(3x+2)', '1/x^2', 'sqrt(x)']) {
    const e = parseCalc(s);
    const r = integrate(e, 'x');
    assert.ok(r, `no antiderivative for ${s}`);
    assert.equal(equiv(diff(r.F, 'x'), e, 'x'), true, s);
  }
});

test('limits and definite integrals by numbers', () => {
  const v = (s: string) => ev(parseCalc(s), {});
  assert.equal(v('lim x→2 (x^2-4)/(x-2)'), 4);
  assert.equal(v('lim x→0 sin x / x'), 1);
  assert.equal(v('lim x→inf (3x^2+1)/(x^2-5)'), 3);
  assert.equal(v('lim x→0 1/x^2'), Infinity);
  assert.ok(Number.isNaN(v('lim x→0 1/x')));
  assert.ok(Math.abs(v('∫[0,2] x^2 dx') - 8 / 3) < 1e-9);
  assert.equal(v('∫[1,inf] 1/x^2 dx'), 1);
  assert.equal(v('∫[1,inf] 1/x dx'), Infinity);
});

test('wrong calculus lines are named', () => {
  assert.deepEqual(codes('derivative', 'd/dx(x^3)', ['3x^3']), ['power-keep']);
  assert.deepEqual(codes('derivative', 'd/dx(x^3)', ['x^2']), ['power-nocoef']);
  assert.deepEqual(codes('derivative', 'd/dx(x^2 + 7)', ['2x + 7']), ['const-kept']);
  assert.deepEqual(codes('derivative', 'd/dx(x^2 sin(x))', ['2x cos x']), ['product-naive']);
  // the outside differentiated, then the inside multiplied in on the next line: a step, not a mistake
  assert.deepEqual(analyze(P('derivative', 'd/dx(sin(3x))'), ['cos(3x)', '3cos(3x)']).lines.map((l) => l.status), ['step', 'ok']);
  assert.deepEqual(codes('derivative', 'd/dx(sin(3x))', ['cos(3x)']), ['chain-missing']);
  assert.deepEqual(codes('derivative', 'd/dx(cos(x))', ['sin x']), ['trig-sign']);
  assert.deepEqual(codes('derivative', 'd/dx(e^(2x))', ['2x e^(2x-1)']), ['exp-power']);
  assert.deepEqual(codes('integral', '∫ x^2 dx', ['x^3 + C']), ['int-no-divide']);
  assert.deepEqual(codes('integral', '∫ x^2 dx', ['2x + C']), ['differentiated-instead']);
  assert.deepEqual(codes('integral', '∫ cos(3x) dx', ['sin(3x) + C']), ['int-inner-ignored']);
  assert.deepEqual(codes('definite', '∫[1,3] 2x dx', ['9']), ['forgot-lower']);
  assert.deepEqual(codes('definite', '∫[1,3] 2x dx', ['-8']), ['limits-swapped']);
  assert.deepEqual(codes('limit', 'lim x→2 (x^2-4)/(x-2)', ['0']), ['zero-over-zero']);
});

test('unfinished work is not accepted as finished', () => {
  assert.equal(analyze(P('integral', '∫ 3x^2 dx'), ['x^3']).verdict, 'unfinished');
  assert.equal(analyze(P('integral', '∫ 3x^2 dx'), ['x^3 + C']).verdict, 'solved');
  assert.equal(analyze(P('derivative', 'd/dx(x^2 sin(x))'), ['d/dx(x^2) sin x + x^2 d/dx(sin x)']).verdict, 'unfinished');
  assert.equal(analyze(P('definite', '∫[0,2] x^2 dx'), ['x^3/3']).verdict, 'unfinished');
  assert.equal(analyze(P('definite', '∫[0,2] x^2 dx'), ['x^3/3', '8/3 - 0', '8/3']).verdict, 'solved');
});

test('clean routes and hints exist for calculus', () => {
  for (const [k, g] of [['derivative', 'd/dx(x^2 sin(x))'], ['derivative', 'd/dx((x^2+1)^3)'], ['integral', '∫ x e^x dx'], ['definite', '∫[0,2] x^2 dx'], ['limit', 'lim x→2 (x^2-4)/(x-2)']] as [ProblemKind, string][]) {
    const path = cleanPath(P(k, g));
    assert.ok(path.length > 0, g);
    assert.equal(analyze(P(k, g), path.map((s) => s.line)).verdict, 'solved', g);
    assert.ok(hintLadder(P(k, g), []), g);
  }
});
