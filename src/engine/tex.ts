/**
 * LaTeX as it turns up in notes and in an AI's answers: `\int u\,dv = uv - \int v\,du`.
 *
 * Lera's own maths is plain text the engine can check ("3x^2 + 4 = 19"). LaTeX is the other way maths gets
 * written, and it only has to be drawn, not checked. These helpers find it: is this piece LaTeX, is this whole
 * line a formula, and where inside a sentence does a formula start and stop when nobody put `$` round it.
 */

/** A LaTeX command (`\frac`, `\,`) or a braced power or subscript (`x^{2}`, `a_{n}`). */
const TEX = /\\[a-zA-Z]+|\\[,;:! ]|[_^]\{/;

export const hasTex = (s: string): boolean => TEX.test(s);

/** Words that are maths even though they are letters: differentials, and the usual pairs of single letters. */
const MATH_WORDS = /^(d[a-z]|uv|vu|xy|ab|sin|cos|tan|sec|csc|cot|ln|log|exp|lim|max|min|arcsin|arccos|arctan)$/i;

/** One space-separated piece of a sentence: can it be part of a formula? */
function mathy(tok: string): boolean {
  const t = tok.replace(/[.,;:!?]+$/, '');
  if (!t) return false;
  if (t.includes('\\')) return true;
  if (/^[A-Za-z]$/.test(t)) return true; // a lone letter: x, u, I, C
  if (MATH_WORDS.test(t)) return true;
  if (/^[\d.,]+$/.test(t)) return true;
  if (/[=+\-*/^_<>|(){}[\]]/.test(t) && !/[A-Za-z]{4,}/.test(t.replace(/\\[a-zA-Z]+/g, ''))) return true;
  return false;
}

/**
 * True when a whole line is a formula in LaTeX, so it is set on its own line: it has LaTeX in it and, once
 * the commands are taken out, no ordinary words are left (text inside \text{…} does not count).
 */
export function isTexLine(line: string): boolean {
  const s = line.trim();
  if (!hasTex(s) || s.length > 400) return false;
  const bare = s.replace(/\\(?:text|mathrm|operatorname|textbf|mathbf)\{[^}]*\}/g, ' ').replace(/\\[a-zA-Z]+/g, ' ');
  const words = bare.match(/[A-Za-z]{3,}/g) ?? [];
  return words.every((w) => MATH_WORDS.test(w));
}

/** Tidies a formula's LaTeX for drawing: `\(…\)`, `\[…\]` and stray `$` are delimiters, not part of it. */
export const cleanTex = (s: string): string =>
  s
    .trim()
    .replace(/^\$\$?|\$\$?$/g, '')
    .replace(/^\\[([]|\\[)\]]$/g, '')
    .trim();

/**
 * Puts `$…$` round LaTeX that sits bare in a sentence, so it is drawn as maths:
 *   "we use the formula \int u dv = uv - \int v du."  →  "we use the formula $\int u dv = uv - \int v du$."
 * A formula is taken to run from the LaTeX outwards over everything that is still maths (letters on their own,
 * numbers, signs, dx) and to stop at the first ordinary word. What is already inside `$…$` is left alone.
 */
export function markTex(text: string): string {
  if (!hasTex(text)) return text;
  // the other ways of fencing maths become dollars first
  const src = text.replace(/\\\((.+?)\\\)/gs, (_m, a: string) => `$${a}$`).replace(/\\\[(.+?)\\\]/gs, (_m, a: string) => `$$${a}$$`);
  return src
    .split(/(\$\$[^$]+\$\$|\$[^$\n]+\$)/g)
    .map((part) => (part.startsWith('$') ? part : markBare(part)))
    .join('');
}

function markBare(text: string): string {
  if (!hasTex(text)) return text;
  // keep the spacing exactly: pieces and the gaps between them alternate
  const parts = text.split(/(\s+)/);
  const isTok = (i: number) => i % 2 === 0 && parts[i] !== '';
  const out = [...parts];
  let i = 0;
  while (i < parts.length) {
    if (!isTok(i) || !hasTex(parts[i])) {
      i++;
      continue;
    }
    // outwards from the LaTeX, over what is still maths; a piece ending in sentence punctuation ends the formula
    let from = i;
    while (from - 2 >= 0 && isTok(from - 2) && mathy(parts[from - 2]) && !/[.,;:!?]$/.test(parts[from - 2])) from -= 2;
    let to = i;
    while (!/[.;:!?]$/.test(parts[to]) && to + 2 < parts.length && isTok(to + 2) && mathy(parts[to + 2])) to += 2;
    // a lone capital at the very start is more likely a word ("I", "A") than a variable, unless a sign follows it
    while (from < i && /^[AI]$/.test(parts[from]) && !/^[=+\-*/<>]/.test(parts[from + 2] ?? '')) from += 2;
    const last = parts[to];
    const tail = /[.,;:!?]+$/.exec(last)?.[0] ?? '';
    out[from] = `$${parts[from]}`;
    out[to] = `${(from === to ? out[to] : last).slice(0, (from === to ? out[to] : last).length - tail.length)}$${tail}`;
    i = to + 1;
  }
  return out.join('');
}
