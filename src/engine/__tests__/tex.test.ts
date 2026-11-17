import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mathRuns, plainLatex } from '../mathtext';
import { cleanTex, hasTex, isTexLine } from '../tex';

/** The same sentence with `$…$` round each formula found (what is already inside dollars is left alone). */
function markMath(text: string): string {
  return text
    .split(/(\$\$[^$]+\$\$|\$[^$\n]+\$)/g)
    .map((part) => {
      if (part.startsWith('$')) return part;
      let out = '';
      let at = 0;
      for (const r of mathRuns(part)) {
        out += `${part.slice(at, r.start)}$${part.slice(r.start, r.end)}$`;
        at = r.end;
      }
      return out + part.slice(at);
    })
    .join('');
}

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
  assert.equal(markMath('First, we use the formula \\int u dv = uv - \\int v du.'), 'First, we use the formula $\\int u dv = uv - \\int v du$.');
  assert.equal(markMath('We choose u = \\sin x and $dv = e^x dx$.'), 'We choose $u = \\sin x$ and $dv = e^x dx$.');
  assert.equal(markMath('This gives du = \\cos x dx and $v = e^x$.'), 'This gives $du = \\cos x dx$ and $v = e^x$.');
  assert.equal(markMath('we get a new integral with e^x \\cos x.'), 'we get a new integral with $e^x \\cos x$.');
});

test('a sentence with several formulas, the way an example is quoted to Lera', () => {
  const got = markMath('Let I be the integral of e^x \\sin x. Apply parts twice and I reappears: ; I = e^x\\sin x - \\int e^x\\cos x dx = e^x\\sin x - e^x\\cos x - I ; I = \\frac{e^x(\\sin x - \\cos x)}{2} + C');
  assert.equal(got, 'Let I be the integral of $e^x \\sin x$. Apply parts twice and I reappears: ; $I = e^x\\sin x - \\int e^x\\cos x dx = e^x\\sin x - e^x\\cos x - I$ ; $I = \\frac{e^x(\\sin x - \\cos x)}{2} + C$');
});

test('what is already fenced is left alone', () => {
  assert.equal(markMath('So $\\frac{1}{2}$ of it.'), 'So $\\frac{1}{2}$ of it.');
  assert.equal(markMath('No maths here at all.'), 'No maths here at all.');
  assert.equal(cleanTex('$$\\int x\\,dx$$'), '\\int x\\,dx');
});

import { cells } from '../../ui/Md';

test('a table row is cut at its bars, but not at the bars inside a formula', () => {
  assert.deepEqual(cells('| $\\tan x$ | $\\ln|\\sec x|$ |'), ['$\\tan x$', '$\\ln|\\sec x|$']);
  assert.deepEqual(cells('| Function | Integral |'), ['Function', 'Integral']);
  assert.deepEqual(cells('a \\| b | c'), ['a | b', 'c']);
});

test('maths written as plain text in a sentence is found, and ordinary words are left alone', () => {
  assert.equal(
    markMath("y = 2/3 x^(3/2) on [0, 3]: f' = √x, so L = ∫ from 0 to 3 of √(1 + x) dx = (2/3)[(1 + x)^(3/2)] from 0 to 3 = (2/3)(8 − 1) = 14/3."),
    "$y = 2/3 x^(3/2)$ on [0, 3]: $f' = √x$, so $L = ∫ from 0 to 3 of √(1 + x) dx = (2/3)[(1 + x)^(3/2)] from 0 to 3 = (2/3)(8 − 1) = 14/3$.",
  );
  assert.equal(markMath('trig powers → 1.4; √(a^2 ± x^2) or √(x^2 − a^2) → trig substitution'), 'trig powers → 1.4; $√(a^2 ± x^2)$ or $√(x^2 − a^2)$ → trig substitution');
  assert.equal(markMath('Shell method (radius x, height h(x)):'), 'Shell method (radius x, height $h(x)$):');
  assert.equal(markMath('x = a becomes u = g(a), and x = b becomes u = g(b).'), '$x = a$ becomes $u = g(a)$, and $x = b$ becomes $u = g(b)$.');
  assert.equal(markMath("It's a 2/3 chance, and/or n/a."), "It's a $2/3$ chance, and/or n/a.");
  assert.deepEqual(mathRuns('Simplify first: algebra, identities, long division.'), []);
  assert.deepEqual(mathRuns('Look for an obvious substitution (an inner function whose derivative is also present).'), []);
});

test('plain maths is drawn with real fractions, raised powers and roots', () => {
  assert.equal(plainLatex('14/3'), '\\frac{14}{3}');
  assert.equal(plainLatex('2^3'), '2^{3}');
  assert.equal(plainLatex('1/√(1 − x^2)'), '\\frac{1}{\\sqrt{1 - x^{2}}}');
  assert.equal(plainLatex('x = (−b ± √(b^2 − 4ac))/(2a)'), 'x = \\frac{- b \\pm \\sqrt{b^{2} - 4 a c}}{2 a}');
  assert.equal(plainLatex('(2/3)[(1 + x)^(3/2)] from 0 to 3 = (2/3)(8 − 1)'), '\\frac{2}{3} \\left[(1 + x)^{\\frac{3}{2}}\\right]_{0}^{3} = \\frac{2}{3} (8 - 1)');
  assert.equal(plainLatex('L = ∫ from 0 to 3 of √(1 + x) dx'), 'L = \\int _{0}^{3} \\sqrt{1 + x} \\,dx');
  assert.equal(plainLatex('f(1/2) + (1/2)^2 + dy/dx'), 'f \\left(\\frac{1}{2}\\right) + \\left(\\frac{1}{2}\\right)^{2} + \\frac{dy}{dx}');
});
