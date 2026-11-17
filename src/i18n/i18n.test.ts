import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { effectiveLang, localized, msg, promptText, setLang, t, tn } from './index';

afterEach(() => setLang('en'));

test('the app follows the phone until a language is picked in Settings', () => {
  assert.equal(effectiveLang({ language: 'en' }, 'ru-RU'), 'ru');
  assert.equal(effectiveLang({ language: 'en' }, 'fr-CA'), 'fr');
  assert.equal(effectiveLang({ language: 'en' }, 'de-DE'), 'en');
  assert.equal(effectiveLang({ language: 'fr', langSet: true }, 'ru-RU'), 'fr');
});

test('a line is looked up by its English, with its values put in afterwards', () => {
  setLang('ru');
  assert.equal(t('Next lesson'), 'Следующий урок');
  assert.equal(t('Part {0} of {1}', { 0: 6, 1: 8 }), 'Часть 6 из 8');
  assert.equal(t('Divide both sides by {0}.', { 0: '$-3$' }), 'Раздели обе части на $-3$.');
  setLang('fr');
  assert.equal(t('Part {0} of {1}', { 0: 6, 1: 8 }), 'Partie 6 sur 8');
  assert.equal(t('A line nobody translated'), 'A line nobody translated');
  setLang('en');
  assert.equal(t('Part {0} of {1}', { 0: 6, 1: 8 }), 'Part 6 of 8');
});

test('a counted line takes the right form in each language', () => {
  const said = (n: number) => tn(n, '{n} day ago', '{n} days ago');
  assert.deepEqual([1, 3].map(said), ['1 day ago', '3 days ago']);
  setLang('fr');
  assert.deepEqual([1, 3].map(said), ['il y a 1 jour', 'il y a 3 jours']);
  setLang('ru');
  assert.deepEqual([1, 3, 5, 11, 21].map(said), ['1 день назад', '3 дня назад', '5 дней назад', '11 дней назад', '21 день назад']);
});

test('a table written in English reads in the app\'s language, and is left alone in English', () => {
  const table = { id: 'first', title: msg('First steps'), steps: [msg('Solve your first problem'), 'x^2 + 1'] };
  assert.equal(localized(table), table);
  setLang('ru');
  assert.deepEqual(localized(table), { id: 'first', title: 'Первые шаги', steps: ['Реши первую задачу', 'x^2 + 1'] });
  assert.equal(localized(table), localized(table));
});

test('a problem\'s instruction is shown in the app\'s language', () => {
  setLang('fr');
  assert.equal(promptText('Simplify'), 'Simplifie');
  assert.equal(promptText('Solve for y'), 'Résous pour y');
  assert.equal(promptText('Evaluate when x = 3, y = 2'), 'Calcule pour x = 3, y = 2');
});
