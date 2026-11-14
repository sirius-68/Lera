import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readDocx } from '../docx';
import { readPdfWith, PdfModule } from '../pdf';
import { structureDoc } from '../structure';
import { analyze, cleanPath } from '../../engine/analyze';
import { LeraDoc } from '../types';

const sample = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../../samples/${name}`, import.meta.url))));
const pdfjs = async () => (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfModule;

const UNITS = ['Expressions', 'Linear Equations', 'Quadratics'];
const TOPICS = [
  'Collecting like terms', 'Expanding brackets', 'Laws of exponents',
  'Solving linear equations', 'Equations with brackets and fractions', 'Linear inequalities',
  'Expanding two brackets', 'Factorising quadratics', 'Solving quadratic equations',
];

function assertAlgebraNotes(doc: LeraDoc) {
  assert.equal(doc.title, 'Algebra Essentials');
  assert.deepEqual(doc.units.map((u) => u.title), UNITS);
  assert.deepEqual(doc.units.flatMap((u) => u.topics.map((t) => t.title)), TOPICS);
  const exercises = doc.units.flatMap((u) => u.topics.flatMap((t) => t.exercises));
  assert.equal(exercises.length, 37);
  assert.ok(exercises.every((e) => e.kind !== 'open'), 'every exercise in these notes is checkable');
  const kinds = new Set(exercises.map((e) => e.kind));
  for (const k of ['simplify', 'expand', 'linear', 'inequality', 'factor', 'quadratic']) assert.ok(kinds.has(k as never), `has ${k}`);
  // every extracted exercise can be solved by the engine, and its clean path is accepted
  for (const e of exercises) {
    const path = cleanPath(e).map((s) => s.line);
    assert.ok(path.length > 0, `no path for ${e.given}`);
    assert.equal(analyze(e, path).verdict, 'solved', `${e.given} via ${path.join(' | ')}`);
  }
  // lessons keep their worked examples and call-outs, and no exercise text leaks into the lesson
  const first = doc.units[0].topics[0];
  assert.ok(first.blocks.some((b) => b.t === 'example'));
  assert.ok(first.blocks.some((b) => b.t === 'note'));
  assert.ok(first.blocks.some((b) => b.t === 'math' && /3x\s*\+\s*5x\s*=\s*8x/.test(b.text)));
  assert.equal(doc.warnings.length, 0);
}

test('Word file with equation-editor maths', async () => {
  const raw = await readDocx(sample('algebra-essentials.docx'), 'algebra-essentials.docx');
  const doc = structureDoc(raw);
  assertAlgebraNotes(doc);
  // inline equations are marked for typesetting
  const p = doc.units[0].topics[0].blocks[0];
  assert.ok(p.t === 'p' && p.text.includes('$3x+4$'));
});

test('Word file with typed maths and real superscripts', async () => {
  const raw = await readDocx(sample('algebra-essentials-typed.docx'), 'algebra-essentials-typed.docx');
  assertAlgebraNotes(structureDoc(raw));
});

test('PDF: headings from font size, powers from raised glyphs', async () => {
  const raw = await readPdfWith(await pdfjs(), sample('algebra-essentials.pdf'), 'algebra-essentials.pdf');
  assert.equal(raw.pages, 5);
  const doc = structureDoc(raw);
  assertAlgebraNotes(doc);
  const all = doc.units.flatMap((u) => u.topics.flatMap((t) => t.exercises.map((e) => e.given)));
  assert.ok(all.includes('4x^2 + 3x - x^2 + 5x'));
  assert.ok(all.includes('(x + 2)^2'));
});

test('PDF whose equations are pictures is reported honestly', async () => {
  const raw = await readPdfWith(await pdfjs(), sample('equations-as-images.pdf'), 'equations-as-images.pdf');
  const doc = structureDoc(raw);
  assert.deepEqual(doc.units.map((u) => u.title), UNITS);
  assert.ok(doc.warnings.some((w) => /pictures/.test(w)));
});

test('a file that is not a Word document fails with a readable message', async () => {
  await assert.rejects(() => readDocx(new TextEncoder().encode('not a zip'), 'x.docx'));
});
