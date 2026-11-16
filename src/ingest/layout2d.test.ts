import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Glyph, markInlineFractions, stackFractions, stripCancelMarks, tidyMathRow } from './layout2d';
import { pdfInternals } from './pdf';

/** Text set like a textbook page: 10pt body from x = 72 to 440, fractions at 8pt, a symbol font for big brackets. */
const T = 'Text';
const PI = 'MathPi';
const g = (str: string, x: number, y: number, h = 10, font = T): Glyph => ({ str, x, y, h, font, w: str.length * h * 0.5 });

/** a stacked fraction at x, around the main baseline y */
const frac = (num: string, den: string, x: number, y: number): Glyph[] => [g(num, x, y + 4.5, 8), g(den, x, y - 4.5, 8)];

const prose = (text: string, y: number, x = 72): Glyph => ({ str: text, x, y, h: 10, font: T, w: 368 });

function page(): Glyph[] {
  return [
    prose('For instance, you can use the distributive property on the problem', 520),
    // 12(1/2 + 2/3 − 3/4) inside a sentence, the brackets from a symbol font
    g('12', 72, 506),
    g('c', 84, 506, 20, PI),
    ...frac('1', '2', 91, 506),
    g('+', 99, 506),
    ...frac('2', '3', 108, 506),
    g('–', 116, 506),
    ...frac('3', '4', 125, 506),
    g('m', 131, 506, 20, PI),
    { str: 'to make your life easier. You distribute the 12 over the frac-', x: 144, y: 506, h: 10, font: T, w: 296 },
    prose('tions by multiplying each fraction by 12 and then combining the results:', 492),

    // the working, set in from the margin
    g('12', 100, 460),
    g('c', 112, 460, 20, PI),
    ...frac('1', '2', 119, 460),
    g('+', 127, 460),
    ...frac('2', '3', 136, 460),
    g('–', 144, 460),
    ...frac('3', '4', 153, 460),
    g('m', 159, 460, 20, PI),

    g('=', 100, 434),
    g('12', 108, 434),
    ...frac('1', '2', 126, 434), // the dot between was not reported by the font
    g('+', 134, 434),
    g('12', 142, 434),
    ...frac('2', '3', 160, 434),
    g('–', 168, 434),
    g('12', 176, 434),
    g('$', 187, 434, 10, PI), // …and this one came out as a dollar sign
    ...frac('3', '4', 194, 434),

    // the same row again with factors crossed out, small numbers beside them
    g('=', 100, 408),
    g('6', 106, 412, 6),
    g('12', 110, 408),
    ...frac('1', '2', 128, 408),
    g('1', 133, 399, 6),
    g('+', 138, 408),
    g('4', 144, 412, 6),
    g('12', 148, 408),
    ...frac('2', '3', 166, 408),
    g('1', 171, 399, 6),

    g('=', 100, 384),
    g('6 + 8 – 9', 108, 384),
    g('=', 100, 368),
    g('5', 108, 368),

    // a rule with its name beside it
    g('a(b + c) = a · b + a · c', 100, 330),
    { str: 'Distributing multiplication over addition', x: 300, y: 330, h: 10, font: T, w: 140 },
    g('a(b – c) = a · b – a · c', 100, 312),
    { str: 'Distributing multiplication over subtraction', x: 300, y: 312, h: 10, font: T, w: 140 },
    prose('The steps in the previous process involve a lot more detail than you really', 280),
  ];
}

test('a numerator above a denominator, with the line between them, is one fraction', () => {
  const out = stackFractions([g('12', 72, 500), ...frac('1', '2', 90, 500), g('+', 98, 500), ...frac('x + 1', '3', 108, 500)]);
  const fr = out.filter((o) => o.frac).map((o) => o.str);
  assert.deepEqual(fr.sort(), ['((x + 1)/3)', '(1/2)']);
  assert.ok(out.filter((o) => o.frac).every((o) => o.y === 500), 'the fraction sits on the main line');
});

test('two ordinary lines of text are never read as a fraction', () => {
  const lines = [g('5', 72, 512), g('3', 72, 500), g('7', 72, 488)];
  assert.equal(stackFractions(lines).some((o) => o.frac), false);
  // an exponent on the lower line is not the middle of a fraction either
  assert.equal(stackFractions([g('5', 72, 512), g('3', 72, 500), g('2', 78, 504, 6)]).some((o) => o.frac), false);
});

test('"1 2 3" over "2 3 4" reported as two runs is three fractions', () => {
  const out = stackFractions([g('12', 60, 500), g('1 2 3', 80, 504.5, 8), g('2 3 4', 80, 495.5, 8), g('=', 110, 500)]);
  assert.deepEqual(out.filter((o) => o.frac).map((o) => o.str), ['(1/2)', '(2/3)', '(3/4)']);
});

test('symbol-font brackets and dots come back; real letters c and m are left alone', () => {
  const row = stackFractions([g('12', 72, 500), g('c', 84, 500, 20, PI), ...frac('1', '2', 91, 500), g('m', 97, 500, 20, PI), g('$', 104, 500, 10, PI), g('4', 112, 500)]).sort((a, b) => a.x - b.x);
  const fixed = tidyMathRow(row, 10, 500, T);
  assert.equal(fixed.map((o) => o.str).join(' '), '12 ( (1/2) ) · 4');
  // c and m as variables: other letters in the same face, nothing tall, no fraction between
  const vars = [g('c', 72, 500, 10, 'Italic'), g('=', 80, 500), g('2', 88, 500), g('m', 94, 500, 10, 'Italic'), g('+', 102, 500), g('b', 110, 500, 10, 'Italic')];
  assert.equal(tidyMathRow(vars, 10, 500, T).map((o) => o.str).join(''), 'c=2m+b');
});

test('the page comes out as the book shows it', () => {
  const lines = pdfInternals.buildLines(stripCancelMarks(stackFractions(page())), 1, 512, 700);
  const paras = pdfInternals.assemble(lines);
  const texts = paras.map((p) => p.text);

  const sentence = texts.find((t) => t.startsWith('For instance'))!;
  assert.ok(sentence.includes('problem $12((1/2) + (2/3) − (3/4))$ to make your life easier. You distribute the 12 over the fractions by multiplying'), sentence);
  assert.ok(!texts.some((t) => /^2 3 4/.test(t)), 'no stray row of denominators');

  const working = paras.find((p) => p.rows)!;
  assert.deepEqual(working.rows, ['12((1/2) + (2/3) − (3/4))', '= 12 · (1/2) + 12 · (2/3) − 12 · (3/4)', '= 6 + 8 − 9', '= 5']);
  assert.equal(working.math, true);

  const rules = paras.filter((p) => p.caption);
  assert.deepEqual(rules.map((p) => [p.text, p.caption]), [
    ['a(b + c) = a · b + a · c', 'Distributing multiplication over addition'],
    ['a(b − c) = a · b − a · c', 'Distributing multiplication over subtraction'],
  ]);
  assert.ok(texts.some((t) => t.startsWith('The steps in the previous process')));
});

test('a fraction inside a sentence is marked for typesetting, and only the maths around it', () => {
  assert.equal(markInlineFractions('Multiply by (1/2) and stop.'), 'Multiply by $(1/2)$ and stop.');
  assert.equal(markInlineFractions('so x = 3 + (2/3), which is a start'), 'so $x = 3 + (2/3)$, which is a start');
  assert.equal(markInlineFractions('I got a (3/4) b here'), 'I got a $(3/4)$ b here');
  assert.equal(markInlineFractions('no fractions here (see page 4/5 of the notes)'), 'no fractions here (see page 4/5 of the notes)');
});

test('one cancel mark is dropped; an exponent is not mistaken for one', () => {
  const one = stripCancelMarks(stackFractions([g('=', 100, 500), g('6', 106, 504, 6), g('12', 110, 500), g('+', 124, 500), g('5', 132, 500)]));
  assert.equal(one.map((o) => o.str).join(' '), '= 12 + 5');
  const power = [g('x', 100, 500), g('2', 105.2, 504, 6), g('3', 109, 500), g('+', 118, 500)];
  assert.equal(stripCancelMarks(power).length, 4);
});
