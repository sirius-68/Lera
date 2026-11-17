import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../analyze';
import { Problem, ProblemKind } from '../types';

/** Working on the side (let u = …, du = …), joining words and lines in u are read the way a teacher reads them. */

const P = (kind: ProblemKind, given: string, concepts: Problem['concepts'] = []): Problem => ({ id: given, kind, prompt: '', given, concepts, source: 'notes', variable: 'x' });
const read = (p: Problem, lines: string[], done = true) => analyze(p, lines, { done });

test('a substitution written with joining words is followed line by line and solved', () => {
  const a = read(P('integral', '∫ 2x cos(x^2 + 1) dx'), ['let u = x^2+1', 'so du = 2x dx', '⇒ ∫ cos(u) du', '= sin(u) + C', 'it implies sin(x^2 + 1) + C']);
  assert.equal(a.verdict, 'solved');
  assert.deepEqual(a.lines.map((l) => l.status), ['ok', 'ok', 'ok', 'ok', 'ok']);
  assert.equal(a.marks.length, 0);
  assert.ok(a.lines[0].aside && a.lines[1].aside);
});

test('several statements on one line, typed without spaces', () => {
  const a = read(P('integral', '∫ 2x cos(x^2 + 1) dx'), ['u = x^2+1, du = 2xdx', '∫ cos(u) du', 'sin(u) + C', 'sin(x^2+1) + C']);
  assert.equal(a.verdict, 'solved');
  assert.equal(a.marks.length, 0);
});

test('an answer still in u is right but not finished', () => {
  const a = read(P('integral', '∫ 2x cos(x^2 + 1) dx'), ['u = x^2+1', 'du = 2x dx', 'sin(u) + C'], false);
  assert.equal(a.lines[2].status, 'ok');
  assert.equal(a.verdict, 'unfinished');
  assert.match(a.remaining ?? '', /back/);
});

test('a wrong differential is caught on its own line', () => {
  const a = read(P('integral', '∫ 2x cos(x^2 + 1) dx'), ['u = x^2+1', 'du = x dx']);
  assert.equal(a.lines[1].status, 'wrong');
  assert.equal(a.lines[1].diag?.code, 'differential');
  assert.equal(a.lines[1].diag?.fix, 'du = 2x dx');
});

test('integration by parts written with u, dv, du, v and the formula', () => {
  const p = P('integral', '∫ x e^(2x) dx', ['integration-by-parts']);
  const a = read(p, ['u = x, dv = e^(2x) dx', 'du = dx, v = e^(2x)/2', 'uv - ∫ v du', 'x e^(2x)/2 - ∫ e^(2x)/2 dx', 'x e^(2x)/2 - e^(2x)/4 + C']);
  assert.equal(a.verdict, 'solved');
  assert.equal(a.marks.length, 0);
  const b = read(p, ['u = x', 'dv = e^(2x) dx', 'v = 2e^(2x)']);
  assert.equal(b.lines[2].diag?.code, 'parts-v');
});

test('the product rule written with named parts and their derivatives', () => {
  const p = P('derivative', 'd/dx(x^2 sin(x))', ['product-rule']);
  assert.equal(read(p, ['u = x^2, v = sin(x)', "u' = 2x, v' = cos(x)", "u'v + uv'", '2x sin(x) + x^2 cos(x)']).verdict, 'solved');
  assert.equal(read(p, ['u = x^2', "u' = x"]).lines[1].diag?.code, 'prime');
});

test('a sentence of reasoning is read, not marked', () => {
  const a = read(P('integral', '∫ 3x^2 dx'), ['since this is a power we use the power rule', 'x^3 + C']);
  assert.equal(a.lines[0].status, 'unchecked');
  assert.equal(a.lines[1].status, 'ok');
  assert.equal(a.marks.length, 0);
});

test('joining words in algebra', () => {
  const p: Problem = { id: 'l', kind: 'linear', prompt: 'Solve for x', given: '3x + 4 = 19', concepts: [], source: 'notes', variable: 'x' };
  const a = read(p, ['so 3x = 15', 'hence x = 5']);
  assert.equal(a.verdict, 'solved');
});
