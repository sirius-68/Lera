import { Node } from './ast';
import {
  Frac, MathError, ONE, ZERO, fAdd, fDiv, fEq, fIsInt, fIsZero, fMul, fNeg, fNum, fPow, fSqrtExact, fAbs, frac,
  gcdBig,
} from './frac';

/**
 * Multivariate polynomials with exact rational coefficients, plus the
 * rational functions built from them. This is the normal form the checker
 * compares lines in: two expressions are equal iff their normal forms are.
 */

/** Monomial key: variables sorted, e.g. "x^2*y". The constant term is "". */
export type Poly = Map<string, Frac>;

const MAX_TERMS = 400;
const MAX_DEGREE = 24;

type Mono = Record<string, number>;

function parseKey(key: string): Mono {
  const m: Mono = {};
  if (!key) return m;
  for (const part of key.split('*')) {
    const [v, e] = part.split('^');
    m[v] = e ? Number(e) : 1;
  }
  return m;
}

function makeKey(m: Mono): string {
  return Object.keys(m)
    .filter((v) => m[v] !== 0)
    .sort()
    .map((v) => (m[v] === 1 ? v : `${v}^${m[v]}`))
    .join('*');
}

export const pZero = (): Poly => new Map();
export const pConst = (c: Frac): Poly => (fIsZero(c) ? new Map() : new Map([['', c]]));
export const pVar = (name: string): Poly => new Map([[name, ONE]]);

export function pAdd(a: Poly, b: Poly): Poly {
  const out: Poly = new Map(a);
  for (const [k, c] of b) {
    const s = fAdd(out.get(k) ?? ZERO, c);
    if (fIsZero(s)) out.delete(k);
    else out.set(k, s);
  }
  return out;
}

export function pScale(a: Poly, c: Frac): Poly {
  if (fIsZero(c)) return pZero();
  const out: Poly = new Map();
  for (const [k, v] of a) out.set(k, fMul(v, c));
  return out;
}

export const pNeg = (a: Poly): Poly => pScale(a, frac(-1));
export const pSub = (a: Poly, b: Poly): Poly => pAdd(a, pNeg(b));

export function pMul(a: Poly, b: Poly): Poly {
  const out: Poly = new Map();
  if (a.size * b.size > MAX_TERMS * 8) throw new MathError('toobig', 'Expression too large');
  for (const [ka, ca] of a) {
    const ma = parseKey(ka);
    for (const [kb, cb] of b) {
      const mb = parseKey(kb);
      const m: Mono = { ...ma };
      for (const v of Object.keys(mb)) m[v] = (m[v] ?? 0) + mb[v];
      for (const v of Object.keys(m)) if (m[v] > MAX_DEGREE) throw new MathError('toobig', 'Power too large');
      const k = makeKey(m);
      const s = fAdd(out.get(k) ?? ZERO, fMul(ca, cb));
      if (fIsZero(s)) out.delete(k);
      else out.set(k, s);
    }
  }
  if (out.size > MAX_TERMS) throw new MathError('toobig', 'Expression too large');
  return out;
}

export function pPow(a: Poly, e: number): Poly {
  if (!Number.isInteger(e) || e < 0) throw new MathError('nonpoly', 'Not a whole-number power');
  if (e > MAX_DEGREE) throw new MathError('toobig', 'Power too large');
  let r = pConst(ONE);
  for (let i = 0; i < e; i++) r = pMul(r, a);
  return r;
}

export const pIsZero = (a: Poly): boolean => a.size === 0;

export function pEq(a: Poly, b: Poly): boolean {
  if (a.size !== b.size) return false;
  for (const [k, c] of a) {
    const o = b.get(k);
    if (!o || !fEq(c, o)) return false;
  }
  return true;
}

export function pIsConst(a: Poly): boolean {
  return a.size === 0 || (a.size === 1 && a.has(''));
}

export function pConstValue(a: Poly): Frac | null {
  if (a.size === 0) return ZERO;
  if (a.size === 1 && a.has('')) return a.get('')!;
  return null;
}

export function pVars(a: Poly): Set<string> {
  const s = new Set<string>();
  for (const k of a.keys()) for (const v of Object.keys(parseKey(k))) s.add(v);
  return s;
}

export function pDegree(a: Poly, v?: string): number {
  let d = 0;
  for (const k of a.keys()) {
    const m = parseKey(k);
    const e = v ? m[v] ?? 0 : Object.values(m).reduce((x, y) => x + y, 0);
    if (e > d) d = e;
  }
  return d;
}

export function pEval(a: Poly, env: Record<string, number>): number {
  let sum = 0;
  for (const [k, c] of a) {
    let t = fNum(c);
    const m = parseKey(k);
    for (const v of Object.keys(m)) t *= Math.pow(env[v] ?? NaN, m[v]);
    sum += t;
  }
  return sum;
}

/** Exact substitution of rational values for variables. */
export function pSubst(a: Poly, env: Record<string, Frac>): Poly {
  let out = pZero();
  for (const [k, c] of a) {
    const m = parseKey(k);
    let coef = c;
    const rest: Mono = {};
    for (const v of Object.keys(m)) {
      if (env[v]) coef = fMul(coef, fPow(env[v], m[v]));
      else rest[v] = m[v];
    }
    out = pAdd(out, new Map([[makeKey(rest), coef]]));
  }
  // clean zero entries introduced above
  for (const [k, c] of out) if (fIsZero(c)) out.delete(k);
  return out;
}

/** Coefficients c0..cn of a polynomial in exactly one variable. */
export function pUniCoeffs(a: Poly, v: string): Frac[] | null {
  const deg = pDegree(a, v);
  const out: Frac[] = Array.from({ length: deg + 1 }, () => ZERO);
  for (const [k, c] of a) {
    const m = parseKey(k);
    const others = Object.keys(m).filter((x) => x !== v);
    if (others.length) return null;
    out[m[v] ?? 0] = c;
  }
  return out;
}

export function pFromUni(coeffs: Frac[], v: string): Poly {
  const out: Poly = new Map();
  coeffs.forEach((c, i) => {
    if (!fIsZero(c)) out.set(i === 0 ? '' : i === 1 ? v : `${v}^${i}`, c);
  });
  return out;
}

/** Terms as [monomial exponents, coefficient], highest total degree first. */
export function pTerms(a: Poly): { mono: Mono; coef: Frac; key: string }[] {
  const list = [...a.entries()].map(([key, coef]) => ({ key, coef, mono: parseKey(key) }));
  const total = (m: Mono) => Object.values(m).reduce((x, y) => x + y, 0);
  list.sort((p, q) => total(q.mono) - total(p.mono) || (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
  return list;
}

/** Scale so all coefficients are integers with gcd 1 and a positive leading coefficient. */
export function pPrimitive(a: Poly): { poly: Poly; factor: Frac } {
  if (a.size === 0) return { poly: a, factor: ONE };
  let lcm = 1n;
  for (const c of a.values()) lcm = (lcm * c.d) / gcdBig(lcm, c.d);
  let g = 0n;
  for (const c of a.values()) g = gcdBig(g, (c.n * lcm) / c.d);
  let factor = frac(g, lcm);
  const lead = pTerms(a)[0].coef;
  if (lead.n < 0n) factor = fNeg(factor);
  return { poly: pScale(a, fDiv(ONE, factor)), factor };
}

/** True if a = k·b for some non-zero constant k. Equations with proportional normal forms are the same equation. */
export function pProportional(a: Poly, b: Poly): boolean {
  if (a.size === 0 || b.size === 0) return a.size === b.size;
  return pEq(pPrimitive(a).poly, pPrimitive(b).poly);
}

/* ───────────── rational functions ───────────── */

export interface Rat {
  n: Poly;
  d: Poly;
}

export const rFromPoly = (p: Poly): Rat => ({ n: p, d: pConst(ONE) });

function rNorm(r: Rat): Rat {
  if (pIsZero(r.d)) throw new MathError('div0', 'Division by zero');
  const dc = pConstValue(r.d);
  if (dc && !fEq(dc, ONE)) return { n: pScale(r.n, fDiv(ONE, dc)), d: pConst(ONE) };
  return r;
}

export const rAdd = (a: Rat, b: Rat): Rat =>
  pEq(a.d, b.d) ? rNorm({ n: pAdd(a.n, b.n), d: a.d }) : rNorm({ n: pAdd(pMul(a.n, b.d), pMul(b.n, a.d)), d: pMul(a.d, b.d) });
export const rNeg = (a: Rat): Rat => ({ n: pNeg(a.n), d: a.d });
export const rSub = (a: Rat, b: Rat): Rat => rAdd(a, rNeg(b));
export const rMul = (a: Rat, b: Rat): Rat => rNorm({ n: pMul(a.n, b.n), d: pMul(a.d, b.d) });
export const rDiv = (a: Rat, b: Rat): Rat => {
  if (pIsZero(b.n)) throw new MathError('div0', 'Division by zero');
  return rNorm({ n: pMul(a.n, b.d), d: pMul(a.d, b.n) });
};
export function rPow(a: Rat, e: number): Rat {
  if (!Number.isInteger(e)) throw new MathError('nonpoly', 'Non-integer power');
  if (e < 0) return rPow(rDiv(rFromPoly(pConst(ONE)), a), -e);
  return rNorm({ n: pPow(a.n, e), d: pPow(a.d, e) });
}
export const rEq = (a: Rat, b: Rat): boolean => pEq(pMul(a.n, b.d), pMul(b.n, a.d));
export const rIsPoly = (a: Rat): boolean => pIsConst(a.d);

/**
 * Normal form of an expression tree, or null when the expression is not a
 * rational function (surds, |x|, variable exponents) — the caller then falls
 * back to numeric comparison.
 */
export function toRat(node: Node): Rat | null {
  try {
    return toRatUnsafe(node);
  } catch (e) {
    if (e instanceof MathError && (e.code === 'nonpoly' || e.code === 'toobig')) return null;
    throw e;
  }
}

function toRatUnsafe(node: Node): Rat {
  switch (node.t) {
    case 'num':
      return rFromPoly(pConst(node.v));
    case 'var':
      return rFromPoly(pVar(node.name));
    case 'add':
      return node.args.map(toRatUnsafe).reduce(rAdd);
    case 'mul':
      return node.args.map(toRatUnsafe).reduce(rMul);
    case 'neg':
      return rNeg(toRatUnsafe(node.arg));
    case 'div':
      return rDiv(toRatUnsafe(node.num), toRatUnsafe(node.den));
    case 'pow': {
      const e = toRatUnsafe(node.exp);
      const ev = rIsPoly(e) ? pConstValue(e.n) : null;
      if (!ev) throw new MathError('nonpoly', 'Variable exponent');
      const base = toRatUnsafe(node.base);
      if (fIsInt(ev)) return rPow(base, Number(ev.n));
      // constant base with a fractional power that happens to be exact, e.g. 9^(1/2)
      const bv = rIsPoly(base) ? pConstValue(base.n) : null;
      if (bv && ev.d === 2n) {
        const root = fSqrtExact(bv);
        if (root) return rFromPoly(pConst(fPow(root, Number(ev.n))));
      }
      throw new MathError('nonpoly', 'Fractional power');
    }
    case 'sqrt': {
      const inner = toRatUnsafe(node.arg);
      const v = rIsPoly(inner) ? pConstValue(inner.n) : null;
      const root = v ? fSqrtExact(v) : null;
      if (!root) throw new MathError('nonpoly', 'Surd');
      return rFromPoly(pConst(root));
    }
    case 'abs': {
      const inner = toRatUnsafe(node.arg);
      const v = rIsPoly(inner) ? pConstValue(inner.n) : null;
      if (!v) throw new MathError('nonpoly', 'Absolute value of a variable');
      return rFromPoly(pConst(fAbs(v)));
    }
    case 'pm':
      throw new MathError('nonpoly', 'Plus-or-minus');
  }
}

/** Plain floating-point evaluation. NaN signals "undefined here". */
export function evalNum(node: Node, env: Record<string, number>): number {
  switch (node.t) {
    case 'num':
      return fNum(node.v);
    case 'var':
      return env[node.name] ?? NaN;
    case 'add':
      return node.args.reduce((s, a) => s + evalNum(a, env), 0);
    case 'mul':
      return node.args.reduce((s, a) => s * evalNum(a, env), 1);
    case 'neg':
      return -evalNum(node.arg, env);
    case 'div': {
      const d = evalNum(node.den, env);
      return d === 0 ? NaN : evalNum(node.num, env) / d;
    }
    case 'pow': {
      const b = evalNum(node.base, env);
      const e = evalNum(node.exp, env);
      if (b < 0 && !Number.isInteger(e)) {
        // odd roots of negatives are real: (-8)^(1/3)
        const inv = 1 / e;
        if (Math.abs(inv - Math.round(inv)) < 1e-9 && Math.round(inv) % 2 !== 0) return -Math.pow(-b, e);
        return NaN;
      }
      return Math.pow(b, e);
    }
    case 'sqrt': {
      const v = evalNum(node.arg, env);
      return v < 0 ? NaN : Math.sqrt(v);
    }
    case 'abs':
      return Math.abs(evalNum(node.arg, env));
    case 'pm':
      return evalNum(node.arg, env);
  }
}

/** Univariate polynomial division over Q. Coefficients low → high. */
export function uniDivMod(a: Frac[], b: Frac[]): { q: Frac[]; r: Frac[] } {
  const r = a.slice();
  const db = uniDeg(b);
  if (db < 0) throw new MathError('div0', 'Division by zero polynomial');
  const q: Frac[] = Array.from({ length: Math.max(0, uniDeg(a) - db + 1) }, () => ZERO);
  for (let i = uniDeg(r); i >= db; i = uniDeg(r)) {
    const c = fDiv(r[i], b[db]);
    q[i - db] = c;
    for (let j = 0; j <= db; j++) r[i - db + j] = fAdd(r[i - db + j], fNeg(fMul(c, b[j])));
    r[i] = ZERO;
    if (uniDeg(r) < 0) break;
  }
  return { q, r };
}

export function uniDeg(a: Frac[]): number {
  for (let i = a.length - 1; i >= 0; i--) if (!fIsZero(a[i])) return i;
  return -1;
}

/** Monic gcd of two univariate polynomials. */
export function uniGcd(a: Frac[], b: Frac[]): Frac[] {
  let x = a.slice();
  let y = b.slice();
  while (uniDeg(y) >= 0) {
    const { r } = uniDivMod(x, y);
    x = y;
    y = r;
  }
  const d = uniDeg(x);
  if (d < 0) return [ONE];
  const lead = x[d];
  return x.slice(0, d + 1).map((c) => fDiv(c, lead));
}
