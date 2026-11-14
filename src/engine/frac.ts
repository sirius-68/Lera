/**
 * Exact rational numbers on BigInt.
 * Everything the checker decides ("does line 3 follow from line 2?") is decided
 * with exact arithmetic, so 0.1 + 0.2 never gets a student marked wrong.
 */
export interface Frac {
  readonly n: bigint;
  readonly d: bigint; // always > 0
}

const bigAbs = (a: bigint): bigint => (a < 0n ? -a : a);

export function gcdBig(a: bigint, b: bigint): bigint {
  a = bigAbs(a);
  b = bigAbs(b);
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

export function frac(n: bigint | number, d: bigint | number = 1n): Frac {
  let nn = typeof n === 'number' ? BigInt(Math.trunc(n)) : n;
  let dd = typeof d === 'number' ? BigInt(Math.trunc(d)) : d;
  if (dd === 0n) throw new MathError('div0', 'Division by zero');
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  const g = gcdBig(nn, dd);
  if (g > 1n) {
    nn /= g;
    dd /= g;
  }
  return { n: nn, d: dd };
}

export class MathError extends Error {
  code: 'div0' | 'toobig' | 'nonpoly' | 'parse';
  constructor(code: MathError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export const ZERO: Frac = { n: 0n, d: 1n };
export const ONE: Frac = { n: 1n, d: 1n };

export const fAdd = (a: Frac, b: Frac): Frac => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const fSub = (a: Frac, b: Frac): Frac => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const fMul = (a: Frac, b: Frac): Frac => frac(a.n * b.n, a.d * b.d);
export const fDiv = (a: Frac, b: Frac): Frac => {
  if (b.n === 0n) throw new MathError('div0', 'Division by zero');
  return frac(a.n * b.d, a.d * b.n);
};
export const fNeg = (a: Frac): Frac => ({ n: -a.n, d: a.d });
export const fAbs = (a: Frac): Frac => ({ n: bigAbs(a.n), d: a.d });
export const fEq = (a: Frac, b: Frac): boolean => a.n === b.n && a.d === b.d;
export const fIsZero = (a: Frac): boolean => a.n === 0n;
export const fIsInt = (a: Frac): boolean => a.d === 1n;
export const fSign = (a: Frac): number => (a.n > 0n ? 1 : a.n < 0n ? -1 : 0);
export const fCmp = (a: Frac, b: Frac): number => {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
};
export const fNum = (a: Frac): number => Number(a.n) / Number(a.d);

export function fPow(a: Frac, e: number): Frac {
  if (!Number.isInteger(e)) throw new MathError('nonpoly', 'Non-integer power');
  if (Math.abs(e) > 64) throw new MathError('toobig', 'Power too large');
  if (e < 0) return fPow(fDiv(ONE, a), -e);
  let r = ONE;
  for (let i = 0; i < e; i++) r = fMul(r, a);
  return r;
}

/** "12.50" -> 25/2. Accepts plain integers too. */
export function fracFromDecimal(s: string): Frac {
  const [int, dec = ''] = s.split('.');
  const digits = (int || '0') + dec;
  return frac(BigInt(digits), 10n ** BigInt(dec.length));
}

/** Integer square root; returns null if x is not a perfect square. */
export function exactSqrtBig(x: bigint): bigint | null {
  if (x < 0n) return null;
  if (x < 2n) return x;
  let r = BigInt(Math.floor(Math.sqrt(Number(x))));
  while (r * r > x) r--;
  while ((r + 1n) * (r + 1n) <= x) r++;
  return r * r === x ? r : null;
}

export function fSqrtExact(a: Frac): Frac | null {
  if (a.n < 0n) return null;
  const n = exactSqrtBig(a.n);
  const d = exactSqrtBig(a.d);
  return n !== null && d !== null ? frac(n, d) : null;
}

/** Nearest "nice" fraction to a float, or null if none within tolerance. */
export function snapToFrac(x: number, maxDen = 24, tol = 1e-7): Frac | null {
  if (!Number.isFinite(x)) return null;
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(x * d);
    if (Math.abs(x - n / d) <= tol * Math.max(1, Math.abs(x))) return frac(n, d);
  }
  return null;
}

export function fText(a: Frac): string {
  return a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`;
}

export function fLatex(a: Frac): string {
  if (a.d === 1n) return a.n.toString();
  const sign = a.n < 0n ? '-' : '';
  return `${sign}\\frac{${bigAbs(a.n)}}{${a.d}}`;
}
