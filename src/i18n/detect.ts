import type { Lang } from './index';

/**
 * A rough guess at the language a document is written in, from its plain words (formulas say nothing).
 * It only has to tell Lera's three languages apart and notice "something else"; the AI does the rest.
 */
const WORDS: Record<'en' | 'fr', string[]> = {
  en: ['the', 'and', 'of', 'is', 'to', 'in', 'that', 'for', 'with', 'are', 'this', 'by', 'we', 'find', 'each', 'when'],
  fr: ['le', 'la', 'les', 'des', 'est', 'et', 'une', 'un', 'pour', 'dans', 'que', 'du', 'on', 'par', 'sont', 'avec', 'soit', 'où'],
};

export function detectLang(text: string): Lang | 'other' {
  const sample = text.slice(0, 20000).toLowerCase();
  const letters = sample.match(/\p{L}/gu) ?? [];
  if (letters.length < 80) return 'en';
  const cyrillic = letters.filter((c) => c >= 'Ѐ' && c <= 'ӿ').length;
  if (cyrillic / letters.length > 0.4) return 'ru';
  const words = sample.split(/[^\p{L}]+/u).filter(Boolean);
  const score = (list: string[]) => words.reduce((n, w) => n + (list.includes(w) ? 1 : 0), 0) / Math.max(1, words.length);
  const en = score(WORDS.en);
  const fr = score(WORDS.fr);
  // a text in neither has few of either list's everyday words
  if (en < 0.04 && fr < 0.04) return 'other';
  return fr > en ? 'fr' : 'en';
}
