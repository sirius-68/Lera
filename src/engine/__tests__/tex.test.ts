import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanTex, hasTex, isTexLine, markTex } from '../tex';

test('LaTeX is recognised, plain maths and plain words are not', () => {
  assert.ok(hasTex('\\int u\\,dv'));
  assert.ok(hasTex('x^{2}'));
  assert.ok(!hasTex('3x^2 + 4 = 19'));
  assert.ok(!hasTex('It reverses the product rule:'));
});

test('a line that is only a formula is a formula line', () => {
  assert.ok(isTexLine("\\int f(g(x))\\,g'(x)\\,dx = \\int f(u)\\,du"));
  assert.ok(isTexLine('\\int_0^1 \\frac{x}{x^2+1}\\,dx = \\frac12\\int_1^2 \\frac{du}{u} = \\frac12\\ln 2'));
  assert.ok(isTexLine('I = e^x\\sin x - \\int e^x\\cos x\\,dx = e^x\\sin x - e^x\\cos x - I \\quad\\Longrightarrow\\quad I = \\frac{e^x(\\sin x - \\cos x)}{2} + C'));
  assert.ok(!isTexLine('Evaluate the integral of 2x \\cos(x^2). Let u = x^2.'));
  assert.ok(!isTexLine('It reverses the chain rule.'));
});

test('bare LaTeX in a sentence gets dollars round exactly the formula', () => {
  assert.equal(markTex('First, we use the formula \\int u dv = uv - \\int v du.'), 'First, we use the formula $\\int u dv = uv - \\int v du$.');
  assert.equal(markTex('We choose u = \\sin x and $dv = e^x dx$.'), 'We choose $u = \\sin x$ and $dv = e^x dx$.');
  assert.equal(markTex('This gives du = \\cos x dx and $v = e^x$.'), 'This gives $du = \\cos x dx$ and $v = e^x$.');
  assert.equal(markTex('we get a new integral with e^x \\cos x.'), 'we get a new integral with $e^x \\cos x$.');
});

test('a sentence with several formulas, the way an example is quoted to Lera', () => {
  const got = markTex('Let I be the integral of e^x \\sin x. Apply parts twice and I reappears: ; I = e^x\\sin x - \\int e^x\\cos x dx = e^x\\sin x - e^x\\cos x - I ; I = \\frac{e^x(\\sin x - \\cos x)}{2} + C');
  assert.equal(got, 'Let I be the integral of $e^x \\sin x$. Apply parts twice and I reappears: ; $I = e^x\\sin x - \\int e^x\\cos x dx = e^x\\sin x - e^x\\cos x - I$ ; $I = \\frac{e^x(\\sin x - \\cos x)}{2} + C$');
});

test('what is already fenced is left alone, and other fences become dollars', () => {
  assert.equal(markTex('So $\\frac{1}{2}$ of it.'), 'So $\\frac{1}{2}$ of it.');
  assert.equal(markTex('So \\(\\frac{1}{2}\\) of it.'), 'So $\\frac{1}{2}$ of it.');
  assert.equal(markTex('No maths here at all.'), 'No maths here at all.');
  assert.equal(cleanTex('$$\\int x\\,dx$$'), '\\int x\\,dx');
});

import { cells } from '../../ui/Md';

test('a table row is cut at its bars, but not at the bars inside a formula', () => {
  assert.deepEqual(cells('| $\\tan x$ | $\\ln|\\sec x|$ |'), ['$\\tan x$', '$\\ln|\\sec x|$']);
  assert.deepEqual(cells('| Function | Integral |'), ['Function', 'Integral']);
  assert.deepEqual(cells('a \\| b | c'), ['a | b', 'c']);
});
