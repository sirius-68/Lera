import { FR } from './fr';
import { RU } from './ru';

/**
 * The app's language: English, French or Russian.
 *
 * English is written in the code; the other two are looked up from it (`t('Good morning')`), so a line
 * that has no translation yet simply shows in English instead of breaking. `{name}` marks a value put in
 * afterwards. Nothing here touches the screen, so the maths engine and the native app share it.
 */
export type Lang = 'en' | 'fr' | 'ru';

export const LANGS: { id: Lang; label: string; english: string }[] = [
  { id: 'en', label: 'English', english: 'English' },
  { id: 'fr', label: 'Français', english: 'French' },
  { id: 'ru', label: 'Русский', english: 'Russian' },
];

const DICT: Record<Exclude<Lang, 'en'>, Record<string, string>> = { fr: FR, ru: RU };

let current: Lang = 'en';

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'fr' || v === 'ru';
export const getLang = (): Lang => current;
export const setLang = (v: unknown): void => {
  current = isLang(v) ? v : 'en';
};
/** 'fr-CA' → 'fr'. Anything Lera does not speak yet is English. */
export const pickLang = (tag: string | undefined | null): Lang => {
  const two = (tag ?? '').slice(0, 2).toLowerCase();
  return isLang(two) ? two : 'en';
};
/** The language's own English name, for telling the AI which language to write in. */
export const langName = (l: Lang = current): string => LANGS.find((x) => x.id === l)?.english ?? 'English';

const fill = (s: string, vars?: Record<string, string | number>): string => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

/** A line of the interface in the app's language. */
export function t(en: string, vars?: Record<string, string | number>): string {
  return fill(current === 'en' ? en : DICT[current][en] ?? en, vars);
}

/**
 * A line that depends on a count: "1 lesson", "3 lessons". `{n}` is the count.
 * Russian has three forms; its entry for the plural line holds them as "one|few|many".
 */
export function tn(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  const all = { n, ...vars };
  if (current === 'en') return fill(n === 1 ? one : other, all);
  if (current === 'fr') return fill(DICT.fr[n < 2 ? one : other] ?? (n === 1 ? one : other), all);
  const forms = (DICT.ru[other] ?? '').split('|');
  if (forms.length < 3) return fill(DICT.ru[n === 1 ? one : other] ?? (n === 1 ? one : other), all);
  const d = Math.abs(n) % 10;
  const dd = Math.abs(n) % 100;
  return fill(forms[d === 1 && dd !== 11 ? 0 : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 1 : 2], all);
}
