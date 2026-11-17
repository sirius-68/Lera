import { FR } from './fr';
import { FR_MORE } from './fr.more';
import { RU } from './ru';
import { RU_MORE } from './ru.more';

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

const DICT: Record<Exclude<Lang, 'en'>, Record<string, string>> = { fr: { ...FR_MORE, ...FR }, ru: { ...RU_MORE, ...RU } };

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
/**
 * The language the app shows: the one picked in Settings, or else the phone's own when Lera speaks it,
 * or else English.
 */
export const effectiveLang = (profile: { language?: string; langSet?: boolean }, system: string | undefined | null): Lang =>
  profile.langSet ? pickLang(profile.language) : pickLang(system);

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

/* ───────────── whole lines, wherever they were written ───────────── */

interface Pattern {
  re: RegExp;
  out: string;
}
const built: Partial<Record<Lang, { byHead: Map<string, Pattern[]>; loose: Pattern[] }>> = {};
const seen = new Map<string, string>();
let seenLang: Lang = 'en';

/** Lines with a value in them ("Part {0} of {1}") become patterns, filed under their first letters for speed. */
function patterns(lang: Exclude<Lang, 'en'>) {
  const hit = built[lang];
  if (hit) return hit;
  const byHead = new Map<string, Pattern[]>();
  const loose: Pattern[] = [];
  const keys = Object.keys(DICT[lang]).filter((k) => /\{\w+\}/.test(k) && k.replace(/\{\w+\}/g, '').trim().length >= 3);
  // the more a pattern spells out, the earlier it is tried
  keys.sort((a, b) => b.replace(/\{\w+\}/g, '').length - a.replace(/\{\w+\}/g, '').length);
  for (const k of keys) {
    const names: string[] = [];
    const src = k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, (_m, n: string) => {
      names.push(n);
      return '(.+?)';
    });
    let out = DICT[lang][k];
    names.forEach((n, i) => (out = out.split(`{${n}}`).join(`\u0001${i}\u0001`)));
    const p = { re: new RegExp(`^${src}$`, 's'), out };
    const head = /^[^{]{3}/.exec(k)?.[0];
    if (head) byHead.set(head, [...(byHead.get(head) ?? []), p]);
    else loose.push(p);
  }
  return (built[lang] = { byHead, loose });
}

/** Russian keeps three forms of a counted line as "one|few|many"; the number in the line picks one. */
function counted(out: string, n: string | undefined): string {
  const forms = out.split('|');
  if (forms.length !== 3 || current !== 'ru') return out;
  const v = Math.abs(parseInt(n ?? '', 10));
  if (Number.isNaN(v)) return forms[2];
  const d = v % 10;
  const dd = v % 100;
  return forms[d === 1 && dd !== 11 ? 0 : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 1 : 2];
}

function one(core: string, lang: Exclude<Lang, 'en'>): string | null {
  const d = DICT[lang];
  const exact = d[core];
  if (exact !== undefined && !exact.includes('|')) return exact;
  // the same line with other numbers in it: "Part 6 of 8" is "Part {0} of {1}"
  if (/\d/.test(core)) {
    const nums: string[] = [];
    const shape = core.replace(/\d+(?:[.,]\d+)?/g, (m) => `{${nums.push(m) - 1}}`);
    // older lines name their one number {n}; a counted line may only be kept under its plural
    const hit = d[shape] ?? (nums.length === 1 ? d[shape.replace('{0}', '{n}')] ?? d[`${shape.replace('{0}', '{n}')}s`] : undefined);
    if (hit !== undefined) return counted(hit, nums[0]).replace(/\{(\d+|n)\}/g, (_m, i: string) => nums[i === 'n' ? 0 : Number(i)] ?? '');
  }
  const { byHead, loose } = patterns(lang);
  for (const p of [...(byHead.get(core.slice(0, 3)) ?? []), ...loose]) {
    const m = p.re.exec(core);
    if (m) return counted(p.out, m[1]).replace(/\u0001(\d+)\u0001/g, (_m, i: string) => line(m[Number(i) + 1] ?? ''));
  }
  return null;
}

/**
 * A whole line in the app's language, whoever wrote it: the screens, the maths engine, the store.
 * Tried in turn: the line itself, the line with its numbers taken out, the line as a pattern with values in it,
 * and last each of its sentences on its own. What has no translation stays as it is, so notes and maths pass
 * through untouched.
 */
export function line(s: string): string {
  if (current === 'en' || !s || !/[A-Za-z]{2}/.test(s)) return s;
  if (seenLang !== current) {
    seen.clear();
    seenLang = current;
  }
  const hit = seen.get(s);
  if (hit !== undefined) return hit;
  const lead = /^\s*/.exec(s)![0];
  const trail = /\s*$/.exec(s.slice(lead.length))![0];
  const core = s.slice(lead.length, s.length - trail.length);
  let out = one(core, current);
  if (out === null && core.length < 600) {
    const parts = core.split(/(?<=[.!?:])(\s+)(?=[A-Z“"(])/);
    if (parts.length > 1) {
      let any = false;
      const done = parts.map((p, i) => {
        if (i % 2) return p;
        const got = one(p, current as Exclude<Lang, 'en'>);
        if (got !== null) any = true;
        return got ?? p;
      });
      if (any) out = done.join('');
    }
  }
  const res = out === null ? s : lead + out + trail;
  // while the translations are being checked, a page can ask for the lines that had none
  const missed = (globalThis as { __leraMissed?: Set<string> }).__leraMissed;
  if (missed && out === null && /[A-Za-z]{3}/.test(core)) missed.add(core);
  if (seen.size > 4000) seen.clear();
  seen.set(s, res);
  return res;
}
