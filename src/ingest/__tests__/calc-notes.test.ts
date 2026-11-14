import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalcProblem, graphFunctions, markInlineMath } from '../calc';
import { buildProblem, structureDoc } from '../structure';
import { repairFlatPowers } from '../text';

test('calculus exercises are read from notes', () => {
  const b = (text: string, inherited?: string) => buildCalcProblem(text, inherited, 't', text);
  assert.equal(b('f(x) = x^3 + 2x^2 − 5x', 'Differentiate each function:')?.given, 'd/dx(x^3 + 2x^2 - 5x)');
  assert.equal(b('y = 3x^4 − sin x', 'Differentiate each function:')?.kind, 'derivative');
  assert.equal(b('∫ 3x^2 dx', 'Evaluate each integral:')?.kind, 'integral');
  assert.equal(b('∫ x^2 dx from 0 to 2')?.kind, 'definite');
  assert.equal(b('Find lim x→2 (x^2 − 4)/(x − 2)')?.kind, 'limit');
  assert.equal(b('Solve 3x + 4 = 19'), null);
});

test('flattened powers are repaired, subscripts are left alone', () => {
  assert.equal(repairFlatPowers('x2 − 5x + 6 = 0'), 'x^2 − 5x + 6 = 0');
  assert.equal(repairFlatPowers('(x + 1)2 = 16'), '(x + 1)^2 = 16');
  assert.equal(repairFlatPowers('x1 + x2 = 5'), 'x1 + x2 = 5');
  assert.equal(buildProblem('x2 − 5x + 6 = 0', 'Solve each equation:', 't')?.kind, 'quadratic');
});

test('graphs and inline maths are found in prose', () => {
  assert.deepEqual(graphFunctions('The graph of y = x^2 − 4 is a parabola.'), ['x^2 - 4']);
  assert.deepEqual(graphFunctions('We know that y = 2x + 1 here.'), []);
  assert.equal(markInlineMath('A quadratic has the form ax^2 + bx + c = 0.'), 'A quadratic has the form $ax^2 + bx + c = 0$.');
  const doc = structureDoc({ kind: 'text', fileName: 'n.txt', paras: [{ text: 'Curves', level: 1 }, { text: 'The graph of y = x^2 − 4 is a parabola.' }] });
  assert.ok(doc.units[0].topics[0].blocks.some((x) => x.t === 'graph'));
});
