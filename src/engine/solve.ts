import { Node, Relation, RelOp, Statement, statementVars } from './ast';
import {
  Frac, ONE, ZERO, exactSqrtBig, fAdd, fDiv, fEq, fIsInt, fIsZero, fLatex, fMul, fNeg, fNum, fSign, fSub, fText,
  frac, gcdBig, snapToFrac, MathError,
} from './frac';
import {
  Rat, evalNum, pDegree, pEval, pIsZero, pSubst, pUniCoeffs, pVars, rSub, toRat, pConstValue, pPrimitive, uniDeg,
} from './poly';

export interface Root {
  value: number;
  exact?: Frac;
  text: string;
  latex: string;
}

export interface SolSet {
  kind: 'finite' | 'all';
  roots: Root[]; // empty + finite = no solution
  approx: boolean;
}

const rootFromFrac = (f: Frac): Root => ({ value: fNum(f), exact: f, text: fText(f), latex: fLatex(f) });

function divisors(n: bigint, cap = 400): bigint[] {
  const out: bigint[] = [];
  const a = n < 0n ? -n : n;
  if (a === 0n) return [];
  for (let i = 1n; i * i <= a && out.length < cap; i++) {
    if (a % i === 0n) {
      out.push(i);
      if (i * i !== a) out.push(a / i);
    }
  }
  return out;
}

/** Evaluate integer-coefficient polynomial (low → high) at p/q exactly. */
function evalAtFrac(coeffs: Frac[], x: Frac): Frac {
  let acc = ZERO;
  for (let i = coeffs.length - 1; i >= 0; i--) acc = fAdd(fMul(acc, x), coeffs[i]);
  return acc;
}

function deflate(coeffs: Frac[], root: Frac): Frac[] {
  // synthetic division by (x - root); coeffs low → high
  const n = coeffs.length - 1;
  const out: Frac[] = new Array(n);
  let carry = coeffs[n];
  for (let i = n - 1; i >= 0; i--) {
    out[i] = carry;
    carry = fAdd(coeffs[i], fMul(carry, root));
  }
  return out;
}

/** a ± b√m written out, with the radical simplified. */
function surdRoot(a: Frac, b: Frac, m: bigint, sign: 1 | -1): Root {
  const value = fNum(a) + sign * fNum(b) * Math.sqrt(Number(m));
  const bAbs = b.n < 0n ? fNeg(b) : b;
  const s = (sign === 1) === b.n > 0n ? '+' : '-';
  const coefText = fEq(bAbs, ONE) ? '' : fIsInt(bAbs) ? bAbs.n.toString() : `(${fText(bAbs)})`;
  const coefLatex = fEq(bAbs, ONE) ? '' : fLatex(bAbs);
  const radT = `${coefText}sqrt(${m})`;
  const radL = `${coefLatex}\\sqrt{${m}}`;
  if (fIsZero(a)) {
    return { value, text: `${s === '-' ? '-' : ''}${radT}`, latex: `${s === '-' ? '-' : ''}${radL}` };
  }
  // put everything over one denominator when that reads better: (-5 + √13)/2
  if (!fIsInt(a) && a.d === bAbs.d) {
    const den = a.d;
    const bn = bAbs.n;
    const bnT = bn === 1n ? '' : bn.toString();
    return {
      value,
      text: `(${a.n} ${s} ${bnT}sqrt(${m}))/${den}`,
      latex: `\\frac{${a.n} ${s} ${bnT}\\sqrt{${m}}}{${den}}`,
    };
  }
  return { value, text: `${fText(a)} ${s} ${radT}`, latex: `${fLatex(a)} ${s} ${radL}` };
}

/** Largest square factor: n = s²·m with m square-free. */
function squareFree(n: bigint): { s: bigint; m: bigint } {
  let s = 1n;
  let m = n;
  for (let p = 2n; p * p <= m && p < 100000n; p++) {
    while (m % (p * p) === 0n) {
      m /= p * p;
      s *= p;
    }
  }
  return { s, m };
}

function durandKerner(coeffs: number[]): number[] {
  // coeffs low → high, returns real roots
  const n = coeffs.length - 1;
  const lead = coeffs[n];
  const c = coeffs.map((x) => x / lead);
  let re = Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * i) / n + 0.4) * 1.3);
  let im = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / n + 0.4) * 1.3);
  for (let iter = 0; iter < 500; iter++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      // p(z)
      let pr = 1;
      let pi = 0;
      for (let k = n - 1; k >= 0; k--) {
        const tr = pr * re[i] - pi * im[i] + c[k];
        const ti = pr * im[i] + pi * re[i];
        pr = tr;
        pi = ti;
      }
      let dr = 1;
      let di = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const ar = re[i] - re[j];
        const ai = im[i] - im[j];
        const tr = dr * ar - di * ai;
        const ti = dr * ai + di * ar;
        dr = tr;
        di = ti;
      }
      const den = dr * dr + di * di || 1e-300;
      const qr = (pr * dr + pi * di) / den;
      const qi = (pi * dr - pr * di) / den;
      re[i] -= qr;
      im[i] -= qi;
      moved = Math.max(moved, Math.abs(qr) + Math.abs(qi));
    }
    if (moved < 1e-13) break;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (Math.abs(im[i]) < 1e-7 * Math.max(1, Math.abs(re[i]))) out.push(re[i]);
  return out;
}

function uniqueRoots(roots: Root[]): Root[] {
  const out: Root[] = [];
  for (const r of roots.sort((a, b) => a.value - b.value)) {
    if (!out.some((o) => closeTo(o.value, r.value))) out.push(r);
  }
  return out;
}

export function closeTo(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Real roots of a univariate polynomial with rational coefficients (low → high). */
export function polyRoots(coeffsIn: Frac[]): { roots: Root[]; approx: boolean } {
  let coeffs = coeffsIn.slice(0, uniDeg(coeffsIn) + 1);
  const roots: Root[] = [];
  let approx = false;
  if (coeffs.length <= 1) return { roots, approx };

  // integer coefficients
  let lcm = 1n;
  for (const c of coeffs) lcm = (lcm * c.d) / gcdBig(lcm, c.d);
  coeffs = coeffs.map((c) => frac((c.n * lcm) / c.d));

  // x = 0 roots
  while (coeffs.length > 1 && fIsZero(coeffs[0])) {
    if (!roots.some((r) => r.value === 0)) roots.push(rootFromFrac(ZERO));
    coeffs = coeffs.slice(1);
  }

  // rational root theorem
  let searching = coeffs.length > 2;
  while (searching && coeffs.length > 2) {
    searching = false;
    const a0 = coeffs[0].n;
    const an = coeffs[coeffs.length - 1].n;
    const ps = divisors(a0);
    const qs = divisors(an);
    if (ps.length * qs.length > 6000) break;
    outer: for (const p of ps) {
      for (const q of qs) {
        for (const sgn of [1n, -1n]) {
          const cand = frac(sgn * p, q);
          if (fIsZero(evalAtFrac(coeffs, cand))) {
            roots.push(rootFromFrac(cand));
            coeffs = deflate(coeffs, cand);
            searching = true;
            break outer;
          }
        }
      }
    }
  }

  const deg = coeffs.length - 1;
  if (deg === 1) {
    roots.push(rootFromFrac(fDiv(fNeg(coeffs[0]), coeffs[1])));
  } else if (deg === 2) {
    const [c, b, a] = coeffs;
    const disc = fSub(fMul(b, b), fMul(frac(4), fMul(a, c)));
    if (fSign(disc) === 0) {
      roots.push(rootFromFrac(fDiv(fNeg(b), fMul(frac(2), a))));
    } else if (fSign(disc) > 0) {
      const twoA = fMul(frac(2), a);
      const mid = fDiv(fNeg(b), twoA);
      // coefficients are integers here, so disc is an integer
      const sq = exactSqrtBig(disc.n);
      if (disc.d === 1n && sq !== null) {
        roots.push(rootFromFrac(fAdd(mid, fDiv(frac(sq), twoA))));
        roots.push(rootFromFrac(fSub(mid, fDiv(frac(sq), twoA))));
      } else {
        const { s, m } = squareFree(disc.n);
        const coef = fDiv(frac(s), twoA);
        roots.push(surdRoot(mid, coef, m, 1));
        roots.push(surdRoot(mid, coef, m, -1));
      }
    }
  } else if (deg >= 3) {
    approx = true;
    for (const v of durandKerner(coeffs.map(fNum))) {
      const snapped = snapToFrac(v, 12, 1e-9);
      roots.push(
        snapped && fIsZero(evalAtFrac(coeffs, snapped))
          ? rootFromFrac(snapped)
          : { value: v, text: fmtNum(v), latex: fmtNum(v) },
      );
    }
  }
  return { roots: uniqueRoots(roots), approx };
}

export function fmtNum(v: number): string {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? '0' : String(r);
}

/** Numeric root finding for equations that are not polynomial (surds, |x|). */
function numericRoots(f: (x: number) => number): Root[] {
  const roots: Root[] = [];
  const LO = -60;
  const HI = 60;
  const STEP = 0.0125;
  let prevX = LO;
  let prevY = f(LO);
  for (let x = LO + STEP; x <= HI + 1e-9; x += STEP) {
    const y = f(x);
    if (Number.isFinite(prevY) && Number.isFinite(y)) {
      if (prevY === 0) roots.push(numRoot(prevX, f));
      else if (prevY * y < 0) {
        let a = prevX;
        let b = x;
        let fa = prevY;
        for (let i = 0; i < 60; i++) {
          const m = (a + b) / 2;
          const fm = f(m);
          if (!Number.isFinite(fm)) break;
          if (fa * fm <= 0) b = m;
          else {
            a = m;
            fa = fm;
          }
        }
        const r = (a + b) / 2;
        // reject sign flips across a pole
        if (Math.abs(f(r)) < 1e-6) roots.push(numRoot(r, f));
      }
    }
    prevX = x;
    prevY = y;
  }
  return uniqueRoots(roots);
}

function numRoot(x: number, f: (x: number) => number): Root {
  const s = snapToFrac(x, 24, 1e-7);
  if (s && Math.abs(f(fNum(s))) < 1e-9) return rootFromFrac(s);
  return { value: x, text: fmtNum(x), latex: fmtNum(x) };
}

/** Solve lhs = rhs for one variable. Null means "this isn't a one-variable equation I can solve". */
export function solveEquation(lhs: Node, rhs: Node, v: string): SolSet | null {
  const L = toRat(lhs);
  const R = toRat(rhs);
  if (L && R) {
    let diff: Rat;
    try {
      diff = rSub(L, R);
    } catch (e) {
      if (e instanceof MathError) return null;
      throw e;
    }
    const vars = new Set([...pVars(diff.n), ...pVars(diff.d)]);
    vars.delete(v);
    if (vars.size > 0) return null;
    if (pIsZero(diff.n)) return { kind: 'all', roots: [], approx: false };
    const coeffs = pUniCoeffs(diff.n, v);
    if (!coeffs) return null;
    const { roots, approx } = polyRoots(coeffs);
    // drop values that make a denominator zero
    const valid = roots.filter((r) => {
      if (r.exact) {
        const dv = pConstValue(pSubst(diff.d, { [v]: r.exact }));
        return dv ? !fIsZero(dv) : true;
      }
      return Math.abs(pEval(diff.d, { [v]: r.value })) > 1e-9;
    });
    return { kind: 'finite', roots: valid, approx };
  }
  // numeric fallback
  const others = new Set<string>();
  statementVars({ kind: 'rel', rels: [{ lhs, op: '=', rhs }], join: 'or' }).forEach((x) => others.add(x));
  others.delete(v);
  if (others.size > 0) return null;
  const f = (x: number) => evalNum(lhs, { [v]: x }) - evalNum(rhs, { [v]: x });
  // identity check on the fallback path
  const probes = [0.37, 1.91, 2.63, 5.2, 11.7];
  const vals = probes.map(f).filter(Number.isFinite);
  if (vals.length >= 3 && vals.every((y) => Math.abs(y) < 1e-9)) return { kind: 'all', roots: [], approx: true };
  return { kind: 'finite', roots: numericRoots(f), approx: true };
}

export function unionSol(sets: SolSet[]): SolSet {
  if (sets.some((s) => s.kind === 'all')) return { kind: 'all', roots: [], approx: sets.some((s) => s.approx) };
  return {
    kind: 'finite',
    roots: uniqueRoots(sets.flatMap((s) => s.roots)),
    approx: sets.some((s) => s.approx),
  };
}

export function sameSol(a: SolSet, b: SolSet): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'all') return true;
  if (a.roots.length !== b.roots.length) return false;
  return a.roots.every((r) => b.roots.some((o) => closeTo(r.value, o.value)));
}

/** Solution set (in variable v) of a line made only of equations. */
export function statementSolutions(st: Statement, v: string): SolSet | null {
  if (st.kind === 'special') return st.value === 'all' ? { kind: 'all', roots: [], approx: false } : { kind: 'finite', roots: [], approx: false };
  if (st.kind !== 'rel') return null;
  if (st.rels.some((r) => r.op !== '=')) return null;
  const sets: SolSet[] = [];
  for (const r of st.rels) {
    const s = solveEquation(r.lhs, r.rhs, v);
    if (!s) return null;
    sets.push(s);
  }
  if (st.join === 'and' && sets.length > 1) {
    // a = b = c chain: values must satisfy every link
    if (sets.every((s) => s.kind === 'all')) return sets[0];
    const finite = sets.filter((s) => s.kind === 'finite');
    const roots = finite[0].roots.filter((r) => finite.every((s) => s.roots.some((o) => closeTo(o.value, r.value))));
    return { kind: 'finite', roots, approx: sets.some((s) => s.approx) };
  }
  return unionSol(sets);
}

/* ───────────── inequalities: compare by truth at sample points ───────────── */

function relTruth(r: Relation, env: Record<string, number>): boolean | null {
  const l = evalNum(r.lhs, env);
  const rr = evalNum(r.rhs, env);
  if (!Number.isFinite(l) || !Number.isFinite(rr)) return null;
  const eq = Math.abs(l - rr) <= 1e-9 * Math.max(1, Math.abs(l), Math.abs(rr));
  switch (r.op) {
    case '=':
      return eq;
    case '!=':
      return !eq;
    case '<':
      return !eq && l < rr;
    case '>':
      return !eq && l > rr;
    case '<=':
      return eq || l < rr;
    case '>=':
      return eq || l > rr;
  }
}

export function statementTruth(st: Statement, env: Record<string, number>): boolean | null {
  if (st.kind === 'special') return st.value === 'all';
  if (st.kind !== 'rel') return null;
  const vals = st.rels.map((r) => relTruth(r, env));
  if (vals.some((v) => v === null)) return null;
  return st.join === 'and' ? vals.every(Boolean) : vals.some(Boolean);
}

function criticalPoints(st: Statement, v: string): number[] {
  if (st.kind !== 'rel') return [];
  const pts: number[] = [];
  for (const r of st.rels) {
    const s = solveEquation(r.lhs, r.rhs, v);
    if (s && s.kind === 'finite') pts.push(...s.roots.map((x) => x.value));
  }
  return pts;
}

/** Do two one-variable statements (typically inequalities) hold for exactly the same x? */
export function sameTruthSet(a: Statement, b: Statement, v: string): boolean {
  const crit = [...criticalPoints(a, v), ...criticalPoints(b, v)].sort((x, y) => x - y);
  const pts = new Set<number>();
  if (crit.length === 0) [-7.3, -1, 0, 1, 4.6].forEach((x) => pts.add(x));
  else {
    pts.add(crit[0] - 1.37);
    pts.add(crit[crit.length - 1] + 1.37);
    crit.forEach((c, i) => {
      pts.add(c);
      if (i > 0) pts.add((crit[i - 1] + c) / 2);
    });
  }
  for (const x of pts) {
    const ta = statementTruth(a, { [v]: x });
    const tb = statementTruth(b, { [v]: x });
    if (ta === null || tb === null) continue;
    if (ta !== tb) return false;
  }
  return true;
}

export const FLIP: Record<RelOp, RelOp> = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '=': '=', '!=': '!=' };

/* ───────────── linear systems ───────────── */

/** Unique solution of a system of linear equations, or null. */
export function solveLinearSystem(rels: Relation[], vars: string[]): Record<string, Frac> | null {
  const rows: Frac[][] = [];
  for (const r of rels) {
    if (r.op !== '=') return null;
    const L = toRat(r.lhs);
    const R = toRat(r.rhs);
    if (!L || !R) return null;
    const d = rSub(L, R);
    if (pConstValue(d.d) === null) return null;
    if (pDegree(d.n) > 1) return null;
    const row = vars.map((x) => d.n.get(x) ?? ZERO);
    row.push(fNeg(d.n.get('') ?? ZERO));
    rows.push(row);
  }
  const n = vars.length;
  if (rows.length < n) return null;
  let rank = 0;
  for (let col = 0; col < n; col++) {
    const piv = rows.findIndex((row, i) => i >= rank && !fIsZero(row[col]));
    if (piv < 0) return null;
    [rows[rank], rows[piv]] = [rows[piv], rows[rank]];
    const p = rows[rank][col];
    rows[rank] = rows[rank].map((x) => fDiv(x, p));
    for (let i = 0; i < rows.length; i++) {
      if (i === rank || fIsZero(rows[i][col])) continue;
      const f = rows[i][col];
      rows[i] = rows[i].map((x, j) => fSub(x, fMul(f, rows[rank][j])));
    }
    rank++;
  }
  // inconsistent leftovers
  for (let i = n; i < rows.length; i++) if (!fIsZero(rows[i][n])) return null;
  const out: Record<string, Frac> = {};
  vars.forEach((x, i) => (out[x] = rows[i][n]));
  return out;
}

/** Is a relation satisfied exactly by a rational assignment? Null if it can't be decided exactly. */
export function relationHoldsAt(r: Relation, env: Record<string, Frac>): boolean | null {
  const L = toRat(r.lhs);
  const R = toRat(r.rhs);
  if (!L || !R) {
    const numEnv: Record<string, number> = {};
    for (const k of Object.keys(env)) numEnv[k] = fNum(env[k]);
    return relTruth(r, numEnv);
  }
  try {
    const d = rSub(L, R);
    const nv = pConstValue(pSubst(d.n, env));
    const dv = pConstValue(pSubst(d.d, env));
    if (!nv || !dv || fIsZero(dv)) return null;
    const s = fSign(fDiv(nv, dv));
    switch (r.op) {
      case '=':
        return s === 0;
      case '!=':
        return s !== 0;
      case '<':
        return s < 0;
      case '>':
        return s > 0;
      case '<=':
        return s <= 0;
      case '>=':
        return s >= 0;
    }
  } catch {
    return null;
  }
}

export { pPrimitive };
