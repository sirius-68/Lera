import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProblem, extractMath, isMathLine, structureDoc } from '../structure';
import { RawDoc, RawPara } from '../types';

const P = (text: string, extra: Partial<RawPara> = {}): RawPara => ({ text, ...extra });

test('recognises a line that is pure maths', () => {
  assert.ok(isMathLine('3x + 4 = 19'));
  assert.ok(isMathLine('(x − 2)(x + 5) = 0.'));
  assert.ok(isMathLine('x = 3 or x = -2'));
  assert.ok(!isMathLine('Solve the equation'));
  assert.ok(!isMathLine('The answer is 4'));
  assert.ok(!isMathLine('2024'));
});

test('finds the maths inside an instruction', () => {
  assert.equal(extractMath('Solve for x: 3x + 4 = 19.')?.given, '3x + 4 = 19');
  assert.equal(extractMath('Simplify 3x + 2x − 5')?.given, '3x + 2x - 5');
  assert.equal(extractMath('Factorise x^2 + 5x + 6 completely.')?.given, 'x^2 + 5x + 6');
  assert.equal(extractMath('1. Solve 2(x − 3) = 8 for x')?.given, '2(x - 3) = 8');
  const e = extractMath('Evaluate 3x^2 − 2x when x = −2');
  assert.equal(e?.given, '3x^2 - 2x');
  assert.deepEqual(e?.subs, { x: '-2' });
  assert.equal(extractMath('Read the chapter again.'), null);
});

test('classifies exercises by what they ask', () => {
  const k = (t: string, inh?: string) => buildProblem(t, inh, 't')?.kind;
  assert.equal(k('Solve 3x + 4 = 19'), 'linear');
  assert.equal(k('Solve x^2 − 5x + 6 = 0'), 'quadratic');
  assert.equal(k('Solve (x − 2)(x + 5) = 0'), 'quadratic');
  assert.equal(k('Solve −2x + 3 > 7'), 'inequality');
  assert.equal(k('Simplify 3x + 2x − 5'), 'simplify');
  assert.equal(k('Expand 3(x + 2)'), 'expand');
  assert.equal(k('Factorise x^2 + 5x + 6'), 'factor');
  assert.equal(k('Calculate 2 + 3 × 4'), 'evaluate');
  assert.equal(k('2x − 7 = 9', 'Solve each equation:'), 'linear');
  assert.equal(k('x + y = 5, x − y = 1', 'Solve the simultaneous equations'), 'system');
  assert.equal(k('Solve the word problem about trains and stations.'), 'open');
  // statements in the notes are not exercises
  assert.equal(buildProblem('x = 5', undefined, 't'), null);
  assert.equal(buildProblem('This is important.', undefined, 't'), null);
});

test('builds units, topics, blocks and exercises from flat paragraphs', () => {
  const raw: RawDoc = {
    kind: 'docx',
    fileName: 'algebra-notes.docx',
    paras: [
      P('Algebra Essentials', { level: 0 }),
      P('Linear Equations', { level: 1 }),
      P('Solving one-step equations', { level: 2 }),
      P('An equation is a statement that two expressions are equal. To solve it, do the same thing to both sides.'),
      P('x + 4 = 9', { math: true }),
      P('Example 1: Solve x + 4 = 9.'),
      P('x = 9 − 4'),
      P('x = 5'),
      P('Remember: whatever you do to one side, do to the other.'),
      P('Exercises', { level: 3 }),
      P('Solve each equation:'),
      P('x + 7 = 12', { list: 'number' }),
      P('3x = 21', { list: 'number' }),
      P('2x − 5 = 9', { list: 'number' }),
      P('Equations with brackets', { level: 2 }),
      P('Multiply out the brackets first, then solve as before.'),
      P('Practice'),
      P('(a) 2(x + 3) = 14 (b) 3(x − 1) = 12'),
      P('Quadratics', { level: 1 }),
      P('Factorising', { level: 2 }),
      P('A quadratic is an expression where the highest power is two.'),
      P('Factorise x^2 + 5x + 6.'),
      P('Simplify 4x + 3x − 2.'),
    ],
  };
  const doc = structureDoc(raw, new Date('2026-11-14T08:00:00Z'));
  assert.equal(doc.title, 'Algebra Essentials');
  assert.deepEqual(doc.units.map((u) => u.title), ['Linear Equations', 'Quadratics']);
  const [u1, u2] = doc.units;
  assert.deepEqual(u1.topics.map((t) => t.title), ['Solving one-step equations', 'Equations with brackets']);
  const t1 = u1.topics[0];
  assert.deepEqual(t1.blocks.map((b) => b.t), ['p', 'math', 'example', 'note']);
  const ex = t1.blocks[2];
  assert.ok(ex.t === 'example' && ex.lines.length === 3);
  assert.deepEqual(t1.exercises.map((e) => e.given), ['x + 7 = 12', '3x = 21', '2x - 5 = 9']);
  assert.ok(t1.exercises.every((e) => e.kind === 'linear' && e.source === 'notes'));
  assert.deepEqual(u1.topics[1].exercises.map((e) => e.given), ['2(x + 3) = 14', '3(x - 1) = 12']);
  assert.ok(u1.topics[1].exercises[0].concepts.includes('distributive'));
  assert.deepEqual(u2.topics[0].exercises.map((e) => e.kind), ['factor', 'simplify']);
  assert.ok(t1.concepts.includes('inverse-operations'));
  assert.ok(doc.glossary['equation']);
  assert.ok(doc.glossary['quadratic']);
});

test('copes with notes that have no headings', () => {
  const paras = Array.from({ length: 30 }, (_, i) => P(`Paragraph number ${i + 1} explains one more idea about algebra in a sentence or two.`));
  const doc = structureDoc({ kind: 'text', fileName: 'loose_notes.txt', paras });
  assert.equal(doc.title, 'Loose notes');
  assert.ok(doc.units.length === 1 && doc.units[0].topics.length >= 2);
  assert.ok(doc.warnings.length >= 1);
});

test('numbered and all-caps headings are detected without style information', () => {
  const doc = structureDoc({
    kind: 'pdf',
    fileName: 'x.pdf',
    paras: [
      P('1. Linear Equations'),
      P('A linear equation has the unknown to the first power only.'),
      P('1. Solve 2x + 1 = 7'),
      P('2. Quadratic Equations'),
      P('These contain a squared term.'),
    ],
  });
  const topics = doc.units.flatMap((u) => u.topics.map((t) => t.title));
  assert.deepEqual(topics, ['Linear Equations', 'Quadratic Equations']);
  assert.equal(doc.units[0].topics[0].exercises.length, 1);
});
