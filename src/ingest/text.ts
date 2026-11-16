const SUP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', 'ⁿ': 'n', 'ˣ': 'x',
};
const SUB: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
};

/**
 * Make text from a PDF or Word file uniform: ligatures, maths-italic letters,
 * odd spaces and dashes all become plain characters, and superscripts become ^n
 * so powers survive.
 */
export function cleanText(input: string): string {
  let s = input;
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿˣ]+/g, (m) => {
    const plain = m.split('').map((c) => SUP[c] ?? c).join('');
    return plain.length > 1 || plain.startsWith('-') ? `^(${plain})` : `^${plain}`;
  });
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (m) => '_' + m.split('').map((c) => SUB[c] ?? c).join(''));
  // NFKC folds ligatures (ﬁ), maths alphabets (𝑥) and compatibility forms into ordinary letters
  s = s.normalize('NFKC');
  s = s
    .replace(/⁄/g, '/')
    .replace(/[−–‒]/g, '−')
    .replace(/[­​‌‍﻿]/g, '')
    .replace(/[  -   　]/g, ' ')
    .replace(/[‘’‚′]/g, '’')
    .replace(/[“”„″]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/** Same line as maths the engine can parse: typographic minus and friends back to ASCII. */
export function toMathText(s: string): string {
  return s
    .replace(/[−–—]/g, '-')
    .replace(/[×·∙⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prose rendering: x^2 → x², * → ·, <= → ≤. */
export function prettyInline(s: string): string {
  const up: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', n: 'ⁿ' };
  const more: Record<string, string> = { ...up, '+': '⁺', '−': '⁻', a: 'ᵃ', b: 'ᵇ', x: 'ˣ', k: 'ᵏ', m: 'ᵐ' };
  return s
    .replace(/\^\(([0-9a-z+\-−]{1,6})\)/g, (whole, e: string) => (e.split('').every((c) => more[c]) ? e.split('').map((c) => more[c]).join('') : whole))
    .replace(/\^\(?(-?[0-9n]{1,3})\)?/g, (_, e: string) => e.split('').map((c) => up[c] ?? c).join(''))
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/(\w|\))\s*\*\s*(\w|\()/g, '$1·$2')
    .replace(/sqrt\(([^()]+)\)/g, '√($1)')
    .replace(/(^|[\s(=+*/·])-(?=[\dA-Za-z(])/g, '$1−');
}

export function slug(s: string, fallback = 'x'): string {
  const base = s.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return base || fallback;
}

/**
 * Some files lose their superscripts on the way in (copy-paste, plain-text export, PDFs that
 * only shrink the glyph): "x2 − 5x + 6 = 0". Nobody writes 2x as "x2", so a digit glued to
 * the back of a letter or a closing bracket is a power — unless the line is using x1, x2 as names.
 */
export function repairFlatPowers(s: string): string {
  if (!/[=+\-−*/·<>]/.test(s)) return s;
  const subs = new Set<string>();
  for (const m of s.matchAll(/(?<![A-Za-z])([a-zA-Z])([0-9])(?![0-9^])/g)) subs.add(m[1] + m[2]);
  // x1 and x2 side by side are subscripts (two unknowns), not powers
  const letters = new Map<string, Set<string>>();
  for (const k of subs) letters.set(k[0], (letters.get(k[0]) ?? new Set()).add(k[1]));
  const named = new Set([...letters.entries()].filter(([, d]) => d.has('1') && d.size >= 2).map(([l]) => l));
  return s
    .replace(/(?<![A-Za-z])([a-zA-Z])([0-9]{1,2})(?![0-9.^])/g, (m, l: string, d: string) => (named.has(l) || d === '0' || d === '1' ? m : `${l}^${d}`))
    .replace(/\)([2-9])(?![0-9.^])/g, ')^$1');
}
