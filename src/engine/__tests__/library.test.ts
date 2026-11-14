import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, cleanPath } from '../analyze';
import { CONCEPTS, conceptsForText } from '../concepts';
import { ALL_CONCEPTS, practiceFor } from '../generate';
import { lineToLatex, parseLine } from '../parse';
import { prepare } from '../check';
import { Problem } from '../types';

test('every concept has a review and a generator', () => {
  for (const id of ALL_CONCEPTS) {
    const c = CONCEPTS[id];
    assert.ok(c, `concept ${id}`);
    assert.ok(c.explain.length >= 2 && c.short.length > 10);
  }
  assert.deepEqual(Object.keys(CONCEPTS).sort(), [...ALL_CONCEPTS].sort());
});

test('worked examples in the library pass the checker', () => {
  for (const c of Object.values(CONCEPTS)) {
    const kind = /Solve the system/.test(c.example.prompt) ? 'system'
      : /inequality/.test(c.example.prompt) ? 'inequality'
      : /Solve/.test(c.example.prompt) ? 'equation'
      : /Expand/.test(c.example.prompt) ? 'expand'
      : /Factor/.test(c.example.prompt) ? 'factor'
      : /Work out|simplest/.test(c.example.prompt) ? 'evaluate' : 'simplify';
    const p: Problem = { id: c.id, kind, prompt: c.example.prompt, given: c.example.given, concepts: [c.id], source: 'review' };
    const a = analyze(p, c.example.steps.map((s) => s.line));
    assert.equal(a.verdict, 'solved', `${c.id}: ${a.lines.map((l) => `${l.text} [${l.status}]`).join(' | ')} ${a.remaining ?? ''}`);
    assert.ok(a.lines.every((l) => l.status === 'ok'), `${c.id}: ${a.lines.map((l) => l.status).join(',')}`);
  }
});

test('maths quoted inside explanations can be typeset', () => {
  for (const c of Object.values(CONCEPTS)) {
    const texts = [...c.explain, c.short];
    for (const t of texts) {
      for (const m of t.matchAll(/\$([^$]+)\$/g)) {
        assert.ok(lineToLatex(m[1]) !== null, `${c.id}: cannot typeset "${m[1]}"`);
      }
    }
    if (c.trap) {
      for (const side of [c.trap.wrong, c.trap.right]) {
        for (const part of side.split(/→|stays/)) assert.ok(parseLine(part.trim()).ok, `${c.id}: trap "${part}"`);
      }
    }
  }
});

test('generated problems are solvable and their clean path is accepted', () => {
  let count = 0;
  for (const id of ALL_CONCEPTS) {
    for (let seed = 1; seed <= 25; seed++) {
      for (const p of practiceFor(id, 3, seed * 7919)) {
        count++;
        assert.ok(prepare(p), `${id}: cannot prepare "${p.given}"`);
        const path = cleanPath(p).map((s) => s.line);
        assert.ok(path.length > 0, `${id}: no path for "${p.given}"`);
        const a = analyze(p, path);
        assert.equal(a.verdict, 'solved', `${id}: "${p.given}" via ${path.join(' | ')} → ${a.lines.map((l) => l.status).join(',')} ${a.remaining ?? ''}`);
        assert.ok(a.lines.every((l) => l.status === 'ok'), `${id}: "${p.given}" ${path.join(' | ')}`);
      }
    }
  }
  assert.ok(count > 1000);
});

test('topic titles map to concepts', () => {
  assert.ok(conceptsForText('Solving linear equations').includes('inverse-operations'));
  assert.ok(conceptsForText('Factorising quadratics').includes('factoring'));
  assert.ok(conceptsForText('Laws of exponents').includes('exponent-rules'));
  assert.ok(conceptsForText('Linear inequalities').includes('inequality-flip'));
});
