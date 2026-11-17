import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, cleanPath, hintLadder, answerOf } from '../analyze';
import { parseLine } from '../parse';
import { statementToText, toLatex } from '../ast';
import { Problem } from '../types';

const P = (kind: Problem['kind'], given: string, extra: Partial<Problem> = {}): Problem => ({
  id: 't', kind, prompt: '', given, concepts: [], source: 'generated', ...extra,
});

const statuses = (p: Problem, lines: string[]) => analyze(p, lines).lines.map((l) => l.status);
const firstMark = (p: Problem, lines: string[]) => analyze(p, lines).lines.find((l) => l.diag)?.diag;

test('parser reads what students type', () => {
  const round = (s: string) => {
    const r = parseLine(s);
    assert.ok(r.ok, `${s} should parse`);
    return r.ok ? statementToText(r.st) : '';
  };
  assert.equal(round('3x+4=19'), '3x + 4 = 19');
  assert.equal(round('x² − 9'), 'x^2 - 9');
  assert.equal(round('2(x−3)(x+1)'), '2(x - 3)(x + 1)');
  assert.equal(round('-2x ≥ 6'), '-2x ≥ 6');
  assert.equal(round('x = ±3'), 'x = 3 or x = -3');
  assert.equal(round('x = 3 or -2'), 'x = 3 or x = -2');
  assert.equal(round('= 5x + 3'), '5x + 3');
  assert.equal(round('x = 5.'), 'x = 5');
  assert.equal(round('no solution'), 'no solution');
  assert.equal(round('(x+1)/(x-2)'), '(x + 1)/(x - 2)');
});

test('parser explains what it cannot read', () => {
  for (const bad of ['3x +', '(x + 2', 'x 2', '2 3', '3x = = 4x)', 'x # 2']) {
    const r = parseLine(bad);
    assert.equal(r.ok, false, `${bad} should not parse`);
    if (!r.ok) assert.ok(r.error.length > 5);
  }
});

test('latex output', () => {
  const r = parseLine('(x^2 - 4)/(2x) + sqrt(9)');
  assert.ok(r.ok && r.st.kind === 'expr');
  if (r.ok && r.st.kind === 'expr') assert.equal(toLatex(r.st.expr), '\\frac{x^{2} - 4}{2x} + \\sqrt{9}');
});

test('a correct linear solution is accepted line by line', () => {
  const a = analyze(P('linear', '3x + 4 = 19'), ['3x = 15', 'x = 5']);
  assert.equal(a.verdict, 'solved');
  assert.deepEqual(a.lines.map((l) => l.status), ['ok', 'ok']);
  assert.equal(a.marks.length, 0);
});

test('equivalent routes are all accepted', () => {
  const p = P('linear', '2(x + 3) = 14');
  assert.equal(analyze(p, ['x + 3 = 7', 'x = 4']).verdict, 'solved');
  assert.equal(analyze(p, ['2x + 6 = 14', '2x = 8', 'x = 4']).verdict, 'solved');
  assert.equal(analyze(p, ['x = 4']).verdict, 'solved');
  assert.equal(analyze(P('linear', '7 = 2x - 3'), ['10 = 2x', '5 = x']).verdict, 'solved');
});

test('one mistake is marked once; later lines are "carried"', () => {
  const p = P('linear', '3x + 4 = 19');
  const a = analyze(p, ['3x = 23', 'x = 23/3']);
  assert.deepEqual(a.lines.map((l) => l.status), ['wrong', 'carried']);
  assert.equal(a.verdict, 'wrong');
  assert.equal(a.marks.length, 1);
});

test('recovering after a wrong line is recognised', () => {
  assert.deepEqual(statuses(P('linear', '3x + 4 = 19'), ['3x = 23', '3x = 15', 'x = 5']), ['wrong', 'recovered', 'ok']);
});

test('unfinished answers are not accepted as final', () => {
  const a = analyze(P('linear', '3x + 4 = 19'), ['3x = 15']);
  assert.equal(a.verdict, 'unfinished');
  assert.match(a.remaining ?? '', /on its own/);
  assert.equal(analyze(P('linear', '3x + 4 = 19'), ['x = 15/3']).verdict, 'unfinished');
});

const cases: [string, Problem, string[], string, string][] = [
  ['moving a term without changing its sign', P('linear', '3x + 4 = 19'), ['3x = 23'], 'transpose-sign', 'inverse-operations'],
  ['an arithmetic slip', P('linear', '3x + 4 = 19'), ['3x = 16'], 'arithmetic-slip', 'arithmetic'],
  ['distributing to the first term only', P('linear', '2(x + 3) = 14'), ['2x + 3 = 14'], 'distribute-first-only', 'distributive'],
  ['sign error distributing a negative', P('linear', '-2(x - 3) = 8'), ['-2x - 6 = 8'], 'distribute-sign', 'distributive'],
  ['minus in front of a bracket', P('linear', '5 - (x + 2) = 9'), ['5 - x + 2 = 9'], 'distribute-negative', 'distributive'],
  ['subtracting a coefficient', P('linear', '4x = 12'), ['x = 8'], 'subtracted-coefficient', 'inverse-operations'],
  ['multiplying instead of dividing', P('linear', '4x = 12'), ['x = 48'], 'multiplied-coefficient', 'inverse-operations'],
  ['dividing only some terms', P('linear', '2x + 6 = 10'), ['x + 6 = 5'], 'divide-partial', 'balance'],
  ['combining unlike terms', P('linear', '2x + 3 = 11'), ['5x = 11'], 'combine-unlike', 'like-terms'],
  ['clearing a fraction on one term only', P('linear', 'x/3 + 2 = 5'), ['x + 2 = 15'], 'multiply-partial', 'clearing-fractions'],
  ['wrong signs in the factors', P('quadratic', 'x^2 - 5x + 6 = 0'), ['(x + 2)(x + 3) = 0'], 'factor-sign', 'factoring'],
  ['roots read off with the wrong sign', P('quadratic', '(x - 2)(x - 3) = 0'), ['x = -2, x = -3'], 'factor-root-sign', 'zero-product'],
  ['forgetting the negative root', P('quadratic', 'x^2 = 9'), ['x = 3'], 'sqrt-pm', 'square-root-pm'],
  ['dividing by the variable', P('quadratic', 'x^2 = 3x'), ['x = 3'], 'divided-by-variable', 'dividing-by-variable'],
  ['squaring a bracket term by term', P('expand', '(x + 3)^2'), ['x^2 + 9'], 'power-of-sum', 'expanding-binomials'],
  ['first and last only', P('expand', '(x + 3)(x - 2)'), ['x^2 - 6'], 'foil-partial', 'expanding-binomials'],
  ['adding exponents when adding', P('simplify', '2x + 3x + 4'), ['5x^2 + 4'], 'add-exponents-when-adding', 'like-terms'],
  ['multiplying exponents', P('simplify', 'x^2 * x^3'), ['x^6'], 'exp-product-multiplied', 'exponent-rules'],
  ['power of a power', P('simplify', '(x^2)^3'), ['x^5'], 'exp-power-added', 'exponent-rules'],
  ['power not applied to the coefficient', P('simplify', '(2x)^3'), ['2x^3'], 'power-of-product', 'exponent-rules'],
  ['the second bracket, not the first', P('simplify', '3(x + 2) - 2(x - 1)'), ['3x + 6 - 2x - 2'], 'distribute-sign', 'distributive'],
  ['factor pair with the wrong sum', P('factor', 'x^2 + 5x + 6'), ['(x + 1)(x + 6)'], 'factor-wrong-sum', 'factoring'],
  ['left-to-right evaluation', P('evaluate', '2 + 3 * 4'), ['20'], 'order-of-operations', 'order-of-operations'],
  ['inequality not flipped', P('inequality', '-2x > 4'), ['x > -2'], 'inequality-flip', 'inequality-flip'],
  ['adding fractions straight across', P('simplify', '1/2 + 1/3'), ['2/5'], 'add-fractions-straight', 'fractions'],
];

for (const [name, problem, lines, code, concept] of cases) {
  test(`diagnoses ${name}`, () => {
    const d = firstMark(problem, lines);
    assert.ok(d, 'a mark is expected');
    assert.equal(d.code, code);
    assert.equal(d.concept, concept);
    assert.ok(d.title.length > 0 && d.message.length > 0);
  });
}

test('severity separates gaps from slips', () => {
  assert.equal(firstMark(P('linear', '3x + 4 = 19'), ['3x = 23'])?.severity, 'gap');
  assert.equal(firstMark(P('linear', '3x + 4 = 19'), ['3x = 16'])?.severity, 'slip');
});

test('a mark comes with a corrected line', () => {
  assert.equal(firstMark(P('linear', '3x + 4 = 19'), ['3x = 16'])?.fix, '3x = 15');
  assert.equal(firstMark(P('linear', '2(x + 3) = 14'), ['2x + 3 = 14'])?.fix, '2x + 6 = 14');
});

test('quadratics: factoring, formula and ± all accepted', () => {
  const p = P('quadratic', 'x^2 - 5x + 6 = 0');
  const a = analyze(p, ['(x - 2)(x - 3) = 0', 'x = 2 or x = 3']);
  assert.equal(a.verdict, 'solved');
  assert.equal(a.approach, 'factoring');
  assert.equal(analyze(p, ['x = 3, x = 2']).verdict, 'solved');
  assert.equal(analyze(P('quadratic', 'x^2 = 9'), ['x = ±3']).verdict, 'solved');
  const f = analyze(P('quadratic', 'x^2 + 3x - 1 = 0'), ['x = (-3 ± sqrt(13))/2']);
  assert.equal(f.verdict, 'solved');
  assert.equal(f.approach, 'quadratic formula');
});

test('expressions: simplify, expand, factor, evaluate', () => {
  assert.equal(analyze(P('simplify', '3(x + 2) - 2(x - 1)'), ['3x + 6 - 2x + 2', 'x + 8']).verdict, 'solved');
  assert.equal(analyze(P('simplify', '3(x + 2) - 2(x - 1)'), ['3x + 6 - 2x + 2']).verdict, 'unfinished');
  assert.equal(analyze(P('expand', '(x + 3)(x - 2)'), ['x^2 + x - 6']).verdict, 'solved');
  assert.equal(analyze(P('factor', '2x^2 + 6x'), ['2x(x + 3)']).verdict, 'solved');
  assert.equal(analyze(P('factor', '2x^2 + 6x'), ['2(x^2 + 3x)']).verdict, 'unfinished');
  assert.equal(analyze(P('factor', 'x^2 - 9'), ['(x - 3)(x + 3)']).verdict, 'solved');
  assert.equal(analyze(P('evaluate', '3x^2 - 2x', { subs: { x: '-2' } }), ['3(-2)^2 - 2(-2)', '12 + 4', '16']).verdict, 'solved');
  assert.equal(analyze(P('simplify', '(x^2 - 4)/(x - 2)'), ['x + 2']).verdict, 'solved');
});

test('a chain written on one line is checked link by link', () => {
  const a = analyze(P('simplify', '2(x + 3) + x'), ['2(x + 3) + x = 2x + 3 + x = 3x + 3']);
  assert.equal(a.lines[0].status, 'wrong');
  assert.equal(a.lines[0].diag?.code, 'distribute-first-only');
});

test('inequalities and systems', () => {
  assert.equal(analyze(P('inequality', '-2x + 3 > 7'), ['-2x > 4', 'x < -2']).verdict, 'solved');
  assert.equal(analyze(P('inequality', '3x - 1 <= 8'), ['3x <= 9', 'x <= 3']).verdict, 'solved');
  const s = P('system', 'x + y = 5, x - y = 1');
  assert.equal(analyze(s, ['2x = 6', 'x = 3', 'x = 3, y = 2']).verdict, 'solved');
  assert.equal(analyze(s, ['2x = 6', 'x = 3']).verdict, 'unfinished');
  assert.equal(analyze(s, ['2x = 4']).lines[0].status, 'wrong');
});

test('special answers', () => {
  assert.equal(analyze(P('linear', '2x + 3 = 2x + 5'), ['3 = 5', 'no solution']).verdict, 'solved');
  assert.equal(analyze(P('linear', '2(x + 1) = 2x + 2'), ['all real numbers']).verdict, 'solved');
});

test('the long way round is not punished', () => {
  const a = analyze(P('linear', '3x + 4 = 19'), ['3x + 4 - 4 = 19 - 4', '3x + 0 = 15', '3x = 15', '3x/3 = 15/3', 'x = 5']);
  assert.equal(a.verdict, 'solved');
  assert.ok(!a.marks.some((m) => m.severity === 'gap'));
});

test('clean paths end at the answer', () => {
  // the same thing done to both sides is its own step, then each side is worked out
  assert.deepEqual(cleanPath(P('linear', '2(x + 3) = 14')).map((s) => s.line), ['2x + 6 = 14', '2x + 6 - 6 = 14 - 6', '2x = 8', '2x/2 = 8/2', 'x = 4']);
  assert.deepEqual(cleanPath(P('quadratic', 'x^2 - 5x + 6 = 0')).map((s) => s.line), ['(x - 2)(x - 3) = 0', 'x = 2 or x = 3']);
  assert.equal(answerOf(P('quadratic', 'x^2 = 9')), 'x = ±3');
  assert.equal(answerOf(P('inequality', '-2x + 3 > 7')), 'x < -2');
  assert.equal(answerOf(P('factor', '3x^2 - 12')), '3(x - 2)(x + 2)');
  // every clean path must itself pass the checker
  for (const p of [P('linear', '2(x + 3) = 14'), P('linear', 'x/3 + 2 = 5'), P('quadratic', '2x^2 + 3x - 2 = 0'), P('quadratic', 'x^2 + 3x - 1 = 0'), P('quadratic', 'x^2 = 3x'), P('expand', '(x + 3)(x - 2)'), P('factor', '3x^2 - 12'), P('inequality', '-2x + 3 > 7'), P('simplify', '(x^2 - 4)/(x - 2)')]) {
    const path = cleanPath(p).map((s) => s.line);
    const a = analyze(p, path);
    assert.equal(a.verdict, 'solved', `${p.given}: ${path.join(' | ')}`);
    assert.ok(a.lines.every((l) => l.status === 'ok'), `${p.given}: ${a.lines.map((l) => l.status).join(',')}`);
  }
});

test('hints climb from a nudge to the next line', () => {
  const h = hintLadder(P('linear', '2(x + 3) = 14'), ['2x + 6 = 14']);
  assert.ok(h);
  assert.equal(h.line, '2x + 6 - 6 = 14 - 6');
  assert.equal(h.tag, 'move');
  assert.ok(h.nudge.endsWith('?'));
  // after a wrong line, the hint restarts from the last line that was still right
  assert.equal(hintLadder(P('linear', '2(x + 3) = 14'), ['2x + 3 = 14'])?.line, '2x + 6 = 14');
});

test('unreadable and blank lines never crash the analysis', () => {
  const a = analyze(P('linear', '3x + 4 = 19'), ['', '3x =', 'hello world', '3x = 15', 'x = 5']);
  assert.equal(a.verdict, 'solved');
  assert.equal(a.lines.filter((l) => l.status === 'unreadable').length >= 1, true);
});
