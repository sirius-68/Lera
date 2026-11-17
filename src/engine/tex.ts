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

/** The `{…}` group (or single token) that starts at `i`: its contents and where it ends. */
function group(s: string, i: number): [string, number] {
  while (s[i] === ' ') i++;
  if (s[i] !== '{') {
    const m = /^\\[a-zA-Z]+|^./.exec(s.slice(i));
    return [m ? m[0] : '', i + (m ? m[0].length : 0)];
  }
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') d++;
    else if (s[j] === '}' && --d === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}

const NAMED: Record<string, string> = {
  cdot: '*', times: '*', div: '/', le: '<=', leq: '<=', ge: '>=', geq: '>=', ne: '!=', neq: '!=', pm: '±', to: '→', rightarrow: '→', infty: '∞', pi: 'π',
  int: '∫', theta: 'θ', alpha: 'α', beta: 'β', quad: ' ', qquad: ' ', dots: '...', ldots: '...', cdots: '...',
};

/**
 * LaTeX rewritten in the plain notation the engine reads, so a question from LaTeX notes can be practised and
 * checked like a typed one: `\int_0^1 \frac{x}{x^2+1}\,dx` → "∫_(0)^(1) ((x)/(x^2+1)) dx".
 * Only the common school notation is covered; anything else is left for the reader to fail on, which just
 * means the question stays "explain only".
 */
export function texToPlain(tex: string): string {
  const walk = (s: string): string => {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\\') {
        const name = /^\\([a-zA-Z]+)/.exec(s.slice(i))?.[1];
        if (!name) {
          // "\," "\;" "\!" are spacing; "\{" is a bracket
          out += /[{}]/.test(s[i + 1] ?? '') ? s[i + 1] : ' ';
          i += 2;
          continue;
        }
        i += name.length + 1;
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
          const [a, j] = group(s, i);
          const [b, k] = group(s, j);
          const top = walk(a);
          const bottom = walk(b);
          // d/dx and dy/dx keep the shape the engine looks for
          out += /^d\s*[a-z]?$/.test(top.trim()) && /^d\s*[a-z]$/.test(bottom.trim()) ? `${top.trim()}/${bottom.trim().replace(/\s+/g, '')} ` : `((${top})/(${bottom}))`;
          i = k;
        } else if (name === 'sqrt') {
          let root = '';
          if (s[i] === '[') {
            const end = s.indexOf(']', i);
            root = s.slice(i + 1, end);
            i = end + 1;
          }
          const [a, j] = group(s, i);
          out += root ? `(${walk(a)})^(1/${walk(root)})` : `sqrt(${walk(a)})`;
          i = j;
        } else if (name === 'text' || name === 'mathrm' || name === 'operatorname' || name === 'mathbf' || name === 'textbf') {
          const [a, j] = group(s, i);
          out += ` ${a} `;
          i = j;
        } else if (name === 'lim') {
          out += 'lim ';
          // \lim_{x \to 0}: the engine reads "lim x→0"
          if (s[i] === '_') {
            const [a, j] = group(s, i + 1);
            out += `${walk(a)} `;
            i = j;
          }
        } else if (/^(left|right|big|Big|bigg|Bigg|displaystyle|limits|mathstrut)$/.test(name)) {
          // sizing only; "\left." is an invisible bracket
          if ((name === 'left' || name === 'right') && s[i] === '.') i++;
        } else if (name in NAMED) out += NAMED[name];
        else out += `${name} `;
      } else if (ch === '^' || ch === '_') {
        const [a, j] = group(s, i + 1);
        const inner = walk(a);
        out += /^[0-9A-Za-z]$/.test(inner) ? ch + inner : `${ch}(${inner})`;
        i = j;
      } else if (ch === '{' || ch === '}') {
        out += ch === '{' ? '(' : ')';
        i++;
      } else if (ch === '$') i++;
      else {
        out += ch;
        i++;
      }
    }
    return out;
  };
  return walk(tex).replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();
}
