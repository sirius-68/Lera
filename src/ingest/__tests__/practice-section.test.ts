import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readText } from '../index';
import { structureDoc } from '../structure';

const NOTES = `# Advanced Calculus 2

# Chapter 1: Techniques of Integration

## 1.1 Basic antiderivatives

Every technique reduces an integral to these forms.

## 1.2 Substitution

It reverses the chain rule.

## 1.3 Integration by parts

\\int u\\,dv = uv - \\int v\\,du

## Practice problems

1. \\int x e^{2x}\\,dx
2. \\int_0^1 \\frac{x}{x^2+1}\\,dx
3. Evaluate \\int \\sin^3 x \\cos x\\,dx
4. \\int \\frac{1}{x^2 - 1}\\,dx
5. Find \\int x^2 \\ln x\\,dx

# Chapter 2: Sequences and Series

## 2.1 Sequences

A sequence converges when its terms settle on one number.

## 2.2 Series

Geometric series converge when |r| < 1.

## Exercises

1. Find the limit of a_n = (3n^2 + 1)/(2n^2 - n).
2. Determine whether the series \\sum 1/n^2 converges.
3. Show that the harmonic series diverges.
4. Evaluate \\lim_{x\\to 0}\\frac{\\sin x}{x}
`;

test('every numbered item of an end-of-chapter practice section becomes an exercise, under its own stop', () => {
  const doc = structureDoc(readText(NOTES, 'notes.md'));
  assert.deepEqual(doc.units.map((u) => u.title), ['Chapter 1: Techniques of Integration', 'Chapter 2: Sequences and Series']);
  const [one, two] = doc.units;
  // the practice section closes the chapter, so it is a stop of its own and not hidden in the last lesson
  assert.deepEqual(one.topics.map((t) => t.title), ['Basic antiderivatives', 'Substitution', 'Integration by parts', 'Practice problems']);
  assert.equal(one.topics[2].exercises.length, 0);
  // all five, including the two that start with a verb and are written in LaTeX
  assert.deepEqual(one.topics[3].exercises.map((e) => e.kind), ['integral', 'definite', 'integral', 'integral', 'integral']);
  // questions the engine cannot work through are kept as written answers, not dropped or misread as equations
  const ex = two.topics[2].exercises;
  assert.deepEqual(two.topics.map((t) => t.title), ['Sequences', 'Series', 'Exercises']);
  assert.deepEqual(ex.map((e) => e.kind), ['open', 'open', 'open', 'limit']);
  assert.match(ex[0].prompt, /^Find the limit of a_n/);
  assert.match(ex[2].prompt, /^Show that the harmonic series diverges/);
});
