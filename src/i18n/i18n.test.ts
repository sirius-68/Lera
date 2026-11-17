import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { effectiveLang, line, setLang } from './index';

afterEach(() => setLang('en'));

test('the app follows the phone until a language is picked in Settings', () => {
  assert.equal(effectiveLang({ language: 'en' }, 'ru-RU'), 'ru');
  assert.equal(effectiveLang({ language: 'en' }, 'fr-CA'), 'fr');
  assert.equal(effectiveLang({ language: 'en' }, 'de-DE'), 'en');
  assert.equal(effectiveLang({ language: 'fr', langSet: true }, 'ru-RU'), 'fr');
});

test('a whole line is translated: as it stands, with other numbers, as a pattern, or sentence by sentence', () => {
  setLang('ru');
  assert.equal(line('Next lesson'), 'Следующий урок');
  assert.equal(line('  Part 6 of 8 '), '  Часть 6 из 8 ');
  assert.equal(line('Divide both sides by $-3$.'), 'Раздели обе части на $-3$.');
  assert.equal(line('Collect like terms. Divide both sides by 5.'), 'Приведи подобные слагаемые. Раздели обе части на 5.');
  setLang('fr');
  assert.equal(line('Part 6 of 8'), 'Partie 6 sur 8');
  assert.equal(line('In $2(x + 3)$ the minus applies to the whole bracket, so every term changes sign: $-2x - 6$.'), 'Dans $2(x + 3)$ le moins s’applique à toute la parenthèse, donc chaque terme change de signe : $-2x - 6$.');
});

test('notes, maths and English itself pass through untouched', () => {
  setLang('ru');
  assert.equal(line('The master idea: cut the quantity into thin slices.'), 'The master idea: cut the quantity into thin slices.');
  assert.equal(line('x^2 + 3x'), 'x^2 + 3x');
  setLang('en');
  assert.equal(line('Next lesson'), 'Next lesson');
});
