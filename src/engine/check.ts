import {
  Node, Relation, Statement, children, containsType, nodeCount, replaceAt, statementVars, terms, variablesOf, walk,
  withChildren,
} from './ast';
import { Frac, MathError, fIsInt, fIsZero, gcdBig } from './frac';
import { parseLine } from './parse';
import {
  Rat, evalNum, pIsConst, pPrimitive, pProportional, pUniCoeffs, pVars, rEq, rSub, toRat,
  uniDeg, uniGcd,
} from './poly';
import {
  SolSet, polyRoots, relationHoldsAt, sameSol, sameTruthSet, solveLinearSystem, statementSolutions,
} from './solve';
import { Problem } from './types';

export type Mode = 'eq' | 'ineq' | 'expr' | 'system' | 'open';

export interface Prepared {
  problem: Problem;
  mode: Mode;
  given: Statement;
  v: string;
  vars: string[];
  subs: Record<string, Node>;
  solution?: SolSet;
  system?: Record<string, Frac>;
}

function pickVariable(vars: Set<string>, preferred?: string): string {
  if (preferred && vars.has(preferred)) return preferred;
  for (const c of ['x', 'y', 'z', 't', 'n', 'a', 'b', 'm', 'p', 'k']) if (vars.has(c)) return c;
  return [...vars][0] ?? preferred ?? 'x';
}

/** Replace variables by expressions (used for "evaluate when x = 4"). */
export function substitute(n: Node, subs: Record<string, Node>): Node {
  if (n.t === 'var' && subs[n.name]) return subs[n.name];
  const kids = children(n);
  if (kids.length === 0) return n;
  return withChildren(n, kids.map((k) => substitute(k, subs)));
}

function substStatement(st: Statement, subs: Record<string, Node>): Statement {
  if (Object.keys(subs).length === 0) return st;
  if (st.kind === 'expr') return { kind: 'expr', expr: substitute(st.expr, subs) };
  if (st.kind === 'rel')
    return { ...st, rels: st.rels.map((r) => ({ ...r, lhs: substitute(r.lhs, subs), rhs: substitute(r.rhs, subs) })) };
  return st;
}

/** Parse the problem and work out what kind of checking applies. Null if the maths can't be read. */
export function prepare(problem: Problem): Prepared | null {
  if (problem.kind === 'open' || !problem.given.trim()) return null;
  const parsed = parseLine(problem.given);
  if (!parsed.ok) return null;
  const given = parsed.st;
  const subs: Record<string, Node> = {};
  for (const [k, val] of Object.entries(problem.subs ?? {})) {
    const p = parseLine(val);
    if (p.ok && p.st.kind === 'expr') subs[k] = p.st.expr;
  }
  const vars = statementVars(given);
  const v = pickVariable(vars, problem.variable);
  const base = { problem, given, v, vars: [...vars].sort(), subs };

  if (given.kind === 'expr') {
    if (['linear', 'quadratic', 'equation', 'inequality', 'system'].includes(problem.kind)) return null;
    return { ...base, mode: 'expr' };
  }
  if (given.kind !== 'rel') return null;

  if (problem.kind === 'system' || (given.rels.length > 1 && given.join !== 'or' && vars.size > 1)) {
    const sol = solveLinearSystem(given.rels, base.vars);
    if (!sol) return null;
    return { ...base, mode: 'system', system: sol };
  }
  if (given.rels.every((r) => r.op === '=')) {
    const sol = statementSolutions(given, v);
    return { ...base, mode: 'eq', solution: sol ?? undefined };
  }
  return { ...base, mode: 'ineq' };
}

const PROBES: number[][] = [
  [1.37, 2.11, 0.73, 3.19, 0.41],
  [2.63, 0.57, 1.83, 4.71, 1.19],
  [0.91, 3.37, 2.29, 0.67, 5.3],
  [-1.43, -2.17, 1.61, -0.79, 2.9],
  [4.13, -0.61, -3.3, 1.07, -1.9],
  [-2.71, 5.9, 0.33, 2.47, -4.1],
  [6.2, 1.7, -5.1, 3.9, 0.9],
];

/** Are two expressions equal for every value of their variables? */
export function exprEquiv(a: Node, b: Node): boolean | null {
  const ra = safeRat(a);
  const rb = safeRat(b);
  if (ra && rb) {
    try {
      return rEq(ra, rb);
    } catch {
      /* fall through to numeric */
    }
  }
  const vars = [...new Set([...variablesOf(a), ...variablesOf(b)])].sort();
  let compared = 0;
  for (const probe of PROBES) {
    const env: Record<string, number> = {};
    vars.forEach((name, i) => (env[name] = probe[i % probe.length] + Math.floor(i / probe.length) * 0.37));
    const va = evalNum(a, env);
    const vb = evalNum(b, env);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    compared++;
    if (Math.abs(va - vb) > 1e-7 * Math.max(1, Math.abs(va), Math.abs(vb))) return false;
  }
  return compared >= 3 ? true : null;
}

export function safeRat(n: Node): Rat | null {
  try {
    return toRat(n);
  } catch (e) {
    if (e instanceof MathError) return null;
    throw e;
  }
}

/** For expression problems: the expressions a line contains, left to right (`a = b = c` → [a, b, c]). */
export function exprChain(st: Statement): Node[] | null {
  if (st.kind === 'expr') return [st.expr];
  if (st.kind === 'rel' && st.rels.every((r) => r.op === '=')) {
    const out: Node[] = [st.rels[0].lhs];
    for (const r of st.rels) out.push(r.rhs);
    return out;
  }
  return null;
}

/** Numerator of lhs − rhs, for comparing equations that have more than one letter in them. */
function equationNumerator(r: Relation) {
  const L = safeRat(r.lhs);
  const R = safeRat(r.rhs);
  if (!L || !R) return null;
  try {
    return rSub(L, R).n;
  } catch {
    return null;
  }
}

/**
 * Do two lines say the same thing?
 * true / false when it can be decided, null when it can't (so nothing gets marked).
 */
export function relate(prep: Prepared, aIn: Statement, bIn: Statement): boolean | null {
  const a = substStatement(aIn, prep.subs);
  const b = substStatement(bIn, prep.subs);
  switch (prep.mode) {
    case 'expr': {
      const ca = exprChain(a);
      const cb = exprChain(b);
      if (!ca || !cb) return null;
      return exprEquiv(ca[ca.length - 1], cb[cb.length - 1]);
    }
    case 'eq': {
      if (a.kind === 'expr' || b.kind === 'expr') return null;
      const sa = statementSolutions(a, prep.v);
      const sb = statementSolutions(b, prep.v);
      if (sa && sb) return sameSol(sa, sb);
      // literal equations (several letters): same equation iff numerators are proportional
      if (a.kind === 'rel' && b.kind === 'rel' && a.rels.length === 1 && b.rels.length === 1) {
        const na = equationNumerator(a.rels[0]);
        const nb = equationNumerator(b.rels[0]);
        if (na && nb && pProportional(na, nb)) return true;
      }
      return null;
    }
    case 'ineq': {
      if (a.kind === 'expr' || b.kind === 'expr') return null;
      return sameTruthSet(a, b, prep.v);
    }
    case 'system': {
      if (b.kind !== 'rel' || !prep.system) return null;
      let all = true;
      for (const r of b.rels) {
        const h = relationHoldsAt(r, prep.system);
        if (h === null) return null;
        if (!h) all = false;
      }
      return all;
    }
    default:
      return null;
  }
}

/* ───────────── "is this a finished answer?" ───────────── */

/** A number written the way a final answer should be: 7, -3, 5/2, 2.5, 3√2. */
export function isSimpleConstant(n: Node): boolean {
  if (variablesOf(n).size > 0) return false;
  const core = n.t === 'neg' ? n.arg : n;
  if (core.t === 'num') return true;
  if (core.t === 'div' && core.num.t === 'num' && core.den.t === 'num') {
    const a = core.num.v;
    const b = core.den.v;
    if (!fIsInt(a) || !fIsInt(b)) return false;
    return b.n !== 1n && gcdBig(a.n, b.n) === 1n;
  }
  // surd answers: accept any tidy constant that still contains a root
  if (containsType(n, 'sqrt')) return nodeCount(n) <= 14;
  return false;
}

function isMonomialTerm(t: Node): boolean {
  let core = t.t === 'neg' ? t.arg : t;
  if (core.t === 'div') {
    if (core.den.t !== 'num') return false;
    core = core.num;
  }
  const factors = core.t === 'mul' ? core.args : [core];
  let numbers = 0;
  const seen = new Set<string>();
  for (const f of factors) {
    if (f.t === 'num') {
      numbers++;
      continue;
    }
    const base = f.t === 'pow' ? f.base : f;
    if (base.t !== 'var') return false;
    if (f.t === 'pow' && f.exp.t !== 'num') return false;
    if (seen.has(base.name)) return false;
    seen.add(base.name);
  }
  return numbers <= 1;
}

/** Fully expanded with like terms collected. */
export function isCollected(expr: Node): boolean {
  const r = safeRat(expr);
  if (!r || !pIsConst(r.d)) return false;
  const ts = terms(expr);
  if (!ts.every(isMonomialTerm)) return false;
  const size = r.n.size === 0 ? 1 : r.n.size;
  return ts.length === size;
}

function flattenFactors(n: Node, out: Node[] = []): Node[] {
  if (n.t === 'neg') return flattenFactors(n.arg, out);
  if (n.t === 'mul') {
    n.args.forEach((a) => flattenFactors(a, out));
    return out;
  }
  if (n.t === 'pow' && n.exp.t === 'num' && fIsInt(n.exp.v) && n.exp.v.n >= 1n && n.exp.v.n <= 12n) {
    for (let i = 0n; i < n.exp.v.n; i++) flattenFactors(n.base, out);
    return out;
  }
  out.push(n);
  return out;
}

function isIrreducibleFactor(f: Node): boolean {
  const r = safeRat(f);
  if (!r || !pIsConst(r.d)) return false;
  const vars = [...pVars(r.n)];
  if (vars.length === 0) return true;
  // every coefficient integer with no common factor left inside the bracket
  const prim = pPrimitive(r.n);
  if (!(prim.factor.d === 1n && (prim.factor.n === 1n || prim.factor.n === -1n))) return false;
  if (vars.length > 1) return true;
  const coeffs = pUniCoeffs(r.n, vars[0]);
  if (!coeffs) return true;
  const deg = uniDeg(coeffs);
  if (deg <= 1) return true;
  return !polyRoots(coeffs).roots.some((x) => x.exact);
}

/** Factored as far as it goes over the rationals. */
export function isFullyFactored(expr: Node, given: Node): boolean {
  const factors = flattenFactors(expr).filter((f) => variablesOf(f).size > 0);
  if (factors.length === 0) return false;
  if (!factors.every(isIrreducibleFactor)) return false;
  if (factors.length >= 2) return true;
  // a single bracket is only "factored" if a common number was pulled out of something irreducible
  const g = safeRat(given);
  if (!g) return false;
  const prim = pPrimitive(g.n);
  const hadContent = !(prim.factor.d === 1n && (prim.factor.n === 1n || prim.factor.n === -1n));
  return hadContent && expr.t !== 'add';
}

function isReducedRational(expr: Node): boolean {
  const r = safeRat(expr);
  if (!r) return false;
  const vars = [...new Set([...pVars(r.n), ...pVars(r.d)])];
  if (vars.length !== 1) return nodeCount(expr) <= 30;
  const n = pUniCoeffs(r.n, vars[0]);
  const d = pUniCoeffs(r.d, vars[0]);
  if (!n || !d) return false;
  return uniDeg(uniGcd(n, d)) <= 0;
}

function solvedRelation(r: Relation, v: string): { ok: boolean; reason?: 'isolate' | 'number' } {
  const lhsIsVar = r.lhs.t === 'var' && r.lhs.name === v;
  const rhsIsVar = r.rhs.t === 'var' && r.rhs.name === v;
  if (!lhsIsVar && !rhsIsVar) return { ok: false, reason: 'isolate' };
  const other = lhsIsVar ? r.rhs : r.lhs;
  if (variablesOf(other).size > 0) return { ok: false, reason: 'isolate' };
  return isSimpleConstant(other) ? { ok: true } : { ok: false, reason: 'number' };
}

export interface FinalCheck {
  final: boolean;
  /** What is still left to do, in Lera's words. */
  remaining?: string;
}

/** Assuming the line is correct: is it also a finished answer? */
export function finalForm(prep: Prepared, st: Statement): FinalCheck {
  const { problem, v } = prep;
  if (prep.mode === 'eq') {
    if (st.kind === 'special') return { final: true };
    if (st.kind !== 'rel') return { final: false, remaining: 'Write it as an equation.' };
    for (const r of st.rels) {
      if (r.op !== '=') return { final: false, remaining: `Finish with ${v} = …` };
      const s = solvedRelation(r, v);
      if (!s.ok)
        return {
          final: false,
          remaining:
            s.reason === 'number'
              ? 'Almost, work out that last number.'
              : `${v} isn’t on its own yet. Keep going until the line reads ${v} = a number.`,
        };
    }
    return { final: true };
  }
  if (prep.mode === 'ineq') {
    if (st.kind === 'special') return { final: true };
    if (st.kind !== 'rel') return { final: false, remaining: 'Write it as an inequality.' };
    for (const r of st.rels) {
      const s = solvedRelation(r, v);
      if (!s.ok)
        return {
          final: false,
          remaining:
            s.reason === 'number' ? 'Almost, work out that last number.' : `Get ${v} on its own on one side.`,
        };
    }
    return { final: true };
  }
  if (prep.mode === 'system') {
    if (st.kind !== 'rel') return { final: false, remaining: 'Give a value for each letter.' };
    const solved = new Set<string>();
    for (const r of st.rels) {
      for (const name of prep.vars) {
        if (solvedRelation(r, name).ok) solved.add(name);
      }
    }
    const missing = prep.vars.filter((x) => !solved.has(x));
    return missing.length
      ? { final: false, remaining: `You still need a value for ${missing.join(' and ')}.` }
      : { final: true };
  }
  if (prep.mode === 'expr') {
    const chain = exprChain(st);
    if (!chain) return { final: false };
    const e = chain[chain.length - 1];
    const givenExpr = prep.given.kind === 'expr' ? prep.given.expr : e;
    switch (problem.kind) {
      case 'evaluate':
        return isSimpleConstant(e) ? { final: true } : { final: false, remaining: 'Keep going until it’s a single number.' };
      case 'factor':
        return isFullyFactored(e, givenExpr)
          ? { final: true }
          : { final: false, remaining: flattenFactors(e).length >= 2 ? 'One of those brackets can be factored further.' : 'Write it as a product of brackets.' };
      case 'expand':
      case 'simplify':
      default: {
        if (isCollected(e)) return { final: true };
        const r = safeRat(e);
        if (r && !pIsConst(r.d)) {
          // a genuine algebraic fraction: finished when nothing more cancels
          const g = safeRat(givenExpr);
          const reducible = g ? !isReducedRational(givenExpr) : false;
          if (isReducedRational(e) && (!reducible || nodeCount(e) < nodeCount(givenExpr)))
            return { final: true };
          return { final: false, remaining: 'Something still cancels top and bottom.' };
        }
        if (!r) {
          // surds and the like: accept once it is no bigger than what we started with
          return nodeCount(e) <= Math.max(6, nodeCount(givenExpr) - 1)
            ? { final: true }
            : { final: false, remaining: 'This can be tidied further.' };
        }
        const hasBrackets = terms(e).some((t) => !isMonomialTerm(t));
        return {
          final: false,
          remaining: hasBrackets ? 'There are still brackets to multiply out.' : 'There are like terms left to collect.',
        };
      }
    }
  }
  return { final: false };
}

/** Every numeric literal in a statement, with a setter that swaps it for another node. */
export function numericLiterals(st: Statement): { node: Node; replace: (n: Node) => Statement; inExponent: boolean }[] {
  const out: { node: Node; replace: (n: Node) => Statement; inExponent: boolean }[] = [];
  const scan = (root: Node, rebuild: (n: Node) => Statement) => {
    const expPaths: string[] = [];
    walk(root, (x, p) => {
      if (x.t === 'pow') expPaths.push([...p, 1].join(','));
    });
    walk(root, (x, p) => {
      if (x.t !== 'num') return;
      const key = p.join(',');
      const inExponent = expPaths.some((e) => key === e || key.startsWith(e + ','));
      out.push({ node: x, inExponent, replace: (n) => rebuild(replaceAt(root, p, n)) });
    });
  };
  if (st.kind === 'expr') scan(st.expr, (e) => ({ kind: 'expr', expr: e }));
  if (st.kind === 'rel') {
    st.rels.forEach((r, i) => {
      scan(r.lhs, (e) => ({ ...st, rels: st.rels.map((q, j) => (j === i ? { ...q, lhs: e } : q)) }));
      scan(r.rhs, (e) => ({ ...st, rels: st.rels.map((q, j) => (j === i ? { ...q, rhs: e } : q)) }));
    });
  }
  return out;
}

export { fIsZero };
