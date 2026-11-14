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
