/**
 * LaTeX as it turns up in notes and in an AI's answers: `\int u\,dv = uv - \int v\,du`.
 *
 * Lera's own maths is plain text the engine can check ("3x^2 + 4 = 19"). LaTeX is the other way maths gets
 * written, and it only has to be drawn, not checked. These helpers tell it apart: is this piece LaTeX, and is
 * this whole line a formula. Finding a formula inside a sentence is mathtext.ts's job.
 */

/** A LaTeX command (`\frac`, `\,`) or a braced power or subscript (`x^{2}`, `a_{n}`). */
const TEX = /\\[a-zA-Z]+|\\[,;:! ]|[_^]\{/;

export const hasTex = (s: string): boolean => TEX.test(s);

/** Words that are maths even though they are letters: differentials, and the usual pairs of single letters. */
const MATH_WORDS = /^(d[a-z]|uv|vu|xy|ab|sin|cos|tan|sec|csc|cot|ln|log|exp|lim|max|min|arcsin|arccos|arctan)$/i;

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
