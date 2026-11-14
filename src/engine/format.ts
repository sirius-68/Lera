import { Node, add, div, mul, neg, num, pow, sym, toLatex, toText } from './ast';
import { Frac, ONE, fEq, fIsInt, frac } from './frac';
import { Poly, pTerms } from './poly';

function monoNode(mono: Record<string, number>): Node | null {
  const parts: Node[] = Object.keys(mono)
    .filter((v) => mono[v] > 0)
    .sort()
    .map((v) => (mono[v] === 1 ? sym(v) : pow(sym(v), num(mono[v]))));
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : mul(...parts);
}

function termNode(coef: Frac, mono: Record<string, number>): Node {
  const negative = coef.n < 0n;
  const abs: Frac = negative ? { n: -coef.n, d: coef.d } : coef;
  const m = monoNode(mono);
  let body: Node;
  if (!m) {
    body = fIsInt(abs) ? num(abs) : div(num(frac(abs.n)), num(frac(abs.d)));
  } else if (fEq(abs, ONE)) {
    body = m;
  } else if (fIsInt(abs)) {
    body = m.t === 'mul' ? mul(num(abs), ...m.args) : mul(num(abs), m);
  } else {
    const top = abs.n === 1n ? m : m.t === 'mul' ? mul(num(frac(abs.n)), ...m.args) : mul(num(frac(abs.n)), m);
    body = div(top, num(frac(abs.d)));
  }
  return negative ? neg(body) : body;
}

/** A polynomial as a tidy tree: highest power first, signs attached to terms. */
export function polyToNode(p: Poly): Node {
  const ts = pTerms(p);
  if (ts.length === 0) return num(0);
  return add(...ts.map((t) => termNode(t.coef, t.mono)));
}

export const polyToText = (p: Poly): string => toText(polyToNode(p));
export const polyToLatex = (p: Poly): string => toLatex(polyToNode(p));
