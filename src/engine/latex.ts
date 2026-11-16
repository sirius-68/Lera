import { calcLatex } from './calc/check';
import { lineToLatex } from './parse';

/** LaTeX for a line of maths in linear text — algebra first, calculus notation (d/dx, ∫, lim, sin …) second. */
export function mathLatex(text: string): string | null {
  const needsCalc = /∫|→|->|d\/d[a-z]|lim|sin|cos|tan|sec|csc|cot|ln\b|ln\(|log|exp\(|\bpi\b|π|∞|\binf\b/i.test(text);
  if (!needsCalc) {
    const a = lineToLatex(text);
    if (a) return a;
  }
  try {
    return calcLatex(text) ?? (needsCalc ? lineToLatex(text) : null);
  } catch {
    return null;
  }
}

/** Put in front of a formula that should be typeset exactly as the document wrote it (see writtenLatex). */
export const AS_WRITTEN = '⁣';

/**
 * LaTeX that keeps a document's own way of writing a formula.
 *
 * mathLatex goes through the engine, which tidies as it goes: "a · b" becomes ab, and "12 · 1/2" one
 * fraction. That is right for a learner's working and wrong for a rule quoted from a book, where
 * "a(b + c) = a · b + a · c" is the whole point. This works on the text alone: a bracket holding one
 * top-level slash is a fraction, a star or raised dot is a dot, powers and subscripts are raised and
 * lowered, and everything else stays in the order it was written.
 */
export function writtenLatex(input: string): string | null {
  const text = input.replace(/−|–/g, '-').replace(/·|×/g, '*').trim();
  if (!text || /[\\{}$]/.test(text)) return null;
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return null;
  }
  if (depth !== 0) return null;

  /** Split `s` at its single top-level slash, or null when it has none or several. */
  const halves = (s: string): [string, string] | null => {
    let d = 0;
    let at = -1;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '(') d++;
      else if (ch === ')') d--;
      else if (ch === '/' && d === 0) {
        if (at >= 0) return null;
        at = i;
      } else if (d === 0 && /[+\-=<>]/.test(ch) && i > 0) return null; // a sum is not one fraction
    }
    return at > 0 && at < s.length - 1 ? [s.slice(0, at), s.slice(at + 1)] : null;
  };
  const bare = (s: string): string => {
    const t = s.trim();
    if (!t.startsWith('(') || !t.endsWith(')')) return t;
    let d = 0;
    for (let i = 0; i < t.length - 1; i++) {
      if (t[i] === '(') d++;
      else if (t[i] === ')' && --d === 0) return t; // the first bracket closes before the end
    }
    return t.slice(1, -1);
  };

  const walk = (s: string): string => {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '(') {
        let d = 0;
        let j = i;
        for (; j < s.length; j++) {
          if (s[j] === '(') d++;
          else if (s[j] === ')' && --d === 0) break;
        }
        const inner = s.slice(i + 1, j);
        const f = halves(inner);
        out += f ? `\\frac{${walk(bare(f[0]))}}{${walk(bare(f[1]))}}` : `\\left(${walk(inner)}\\right)`;
        i = j + 1;
      } else if (ch === '^' || ch === '_') {
        let j = i + 1;
        let arg: string;
        if (s[j] === '(') {
          let d = 0;
          const from = j;
          for (; j < s.length; j++) {
            if (s[j] === '(') d++;
            else if (s[j] === ')' && --d === 0) break;
          }
          arg = walk(s.slice(from + 1, j));
          j++;
        } else {
          const m = /^-?[0-9A-Za-z.]+/.exec(s.slice(j));
          arg = m ? m[0] : '';
          j += arg.length;
        }
        out += `${ch}{${arg}}`;
        i = j;
      } else if (ch === '*') {
        out += ' \\cdot ';
        i++;
      } else if (ch === '/') {
        out += ' / ';
        i++;
      } else {
        out += /[<>]/.test(ch) && s[i + 1] === '=' ? (i++, ch === '<' ? ' \\le ' : ' \\ge ') : ch;
        i++;
      }
    }
    return out;
  };
  return walk(text).replace(/\s+/g, ' ').trim();
}
