import { Node, Statement, statementToText, terms, toText } from './ast';
import { Prepared, isCollected, safeRat, substitute } from './check';
import { polyToText } from './format';
import { Frac, ONE, ZERO, fDiv, fEq, fIsInt, fIsZero, fMul, fNeg, fSign, fSub, fText, frac, gcdBig } from './frac';
import {
  Poly, pAdd, pConst, pConstValue, pDegree, pFromUni, pIsConst, pPrimitive, pScale, pSub, pTerms, pUniCoeffs, pVars,
  uniDeg, uniDivMod, uniGcd,
} from './poly';
import { FLIP, Root, polyRoots, solveEquation } from './solve';
import { SolutionStep } from './types';
import { t as tr } from '../i18n';

/**
 * The "clean path": a short, textbook route from a line to the answer.
 * Used for hints (the next line), for the side-by-side comparison after a
 * problem, and to judge whether a student took the long way round.
 */

function lcmOfDenominators(ps: Poly[]): bigint {
  let l = 1n;
  for (const p of ps) for (const c of p.values()) l = (l * c.d) / gcdBig(l, c.d);
  return l;
}

function linearFactor(root: Frac, v: string): Poly {
  // root p/q  →  q·v − p
  return pFromUni([frac(-root.n), frac(root.d)], v);
}

const bracket = (p: Poly): string => `(${polyToText(p)})`;

function rootsLine(v: string, roots: Root[]): string {
  if (roots.length === 0) return tr('no solution');
  // a matching pair reads best as x = ±3
  if (roots.length === 2 && roots[0].exact && roots[1].exact && roots[0].value === -roots[1].value && roots[1].value > 0) {
    return `${v} = ±${roots[1].text}`;
  }
  return roots.map((r) => `${v} = ${r.text}`).join(' or ');
}

/** Factor a univariate polynomial over the rationals into text like 2(x - 3)(x + 1). */
export function factorText(p: Poly, v: string): { text: string; changed: boolean; parts: { content: string; linear: Frac[]; rest?: Poly } } | null {
  const coeffs = pUniCoeffs(p, v);
  if (!coeffs) return null;
  const prim = pPrimitive(p);
  let work = pUniCoeffs(prim.poly, v) as Frac[];
  const linear: Frac[] = [];
  // peel off rational roots one at a time (keeps multiplicity)
  for (let guard = 0; guard < 12; guard++) {
    if (uniDeg(work) < 1) break;
    const exact = polyRoots(work).roots.find((r) => r.exact);
    if (!exact || !exact.exact) break;
    const f = [frac(-exact.exact.n), frac(exact.exact.d)];
    const { q } = uniDivMod(work, f);
    work = q;
    linear.push(exact.exact);
  }
  // whatever constant is left belongs with the content
  const restDeg = uniDeg(work);
  let content = prim.factor;
  let rest: Poly | undefined;
  if (restDeg <= 0) {
    content = fMul(content, work[0] ?? ONE);
  } else {
    const rp = pPrimitive(pFromUni(work, v));
    content = fMul(content, rp.factor);
    rest = rp.poly;
  }
  // smallest numbers first reads most naturally: (x + 2)(x + 3), (x - 2)(x - 3)
  const mag = (f: Frac) => Math.abs(Number(f.n) / Number(f.d));
  linear.sort((a, b) => mag(a) - mag(b) || Number(b.n * a.d - a.n * b.d));
  const pieces: string[] = [];
  // group repeated factors as powers; a bare variable prints as x, not (x)
  const counts = new Map<string, { root: Frac; n: number }>();
  for (const r of linear) {
    const key = fText(r);
    const e = counts.get(key);
    if (e) e.n++;
    else counts.set(key, { root: r, n: 1 });
  }
  let lead = '';
  for (const { root, n } of counts.values()) {
    if (fIsZero(root)) {
      lead += n === 1 ? v : `${v}^${n}`;
      continue;
    }
    const b = bracket(linearFactor(root, v));
    pieces.push(n === 1 ? b : `${b}^${n}`);
  }
  if (rest) pieces.push(bracket(rest));
  const contentText = fEq(content, ONE) ? '' : fEq(content, frac(-1)) ? '-' : fIsInt(content) ? content.n.toString() : `(${fText(content)})`;
  const nonConstFactors = linear.length + (rest ? 1 : 0);
  const changed = nonConstFactors >= 2 || (nonConstFactors === 1 && contentText !== '' && contentText !== '-');
  let text = contentText + lead + pieces.join('');
  if (!lead && linear.length === 1 && !contentText && !rest) text = polyToText(linearFactor(linear[0], v));
  if (!text) text = polyToText(p);
  return { text, changed, parts: { content: contentText, linear, rest } };
}

function equationSteps(prep: Prepared, st: Statement, isIneq: boolean): SolutionStep[] {
  const out: SolutionStep[] = [];
  if (st.kind !== 'rel' || st.rels.length !== 1) return out;
  const rel = st.rels[0];
  let op = rel.op;
  const v = prep.v;
  const L0 = safeRat(rel.lhs);
  const R0 = safeRat(rel.rhs);
  if (!L0 || !R0 || !pIsConst(L0.d) || !pIsConst(R0.d)) {
    // algebraic fractions or surds: give the destination, not a route
    const sol = solveEquation(rel.lhs, rel.rhs, v);
    if (sol && sol.kind === 'finite' && !isIneq)
      out.push({ line: rootsLine(v, sol.roots), why: tr('Work towards getting the unknown on its own.'), tag: 'final' });
    return out;
  }
  let L = L0.n;
  let R = R0.n;
  const others = new Set([...pVars(L), ...pVars(R)]);
  others.delete(v);
  if (others.size > 0) return out;

  let lhsNode: Node | null = rel.lhs;
  let rhsNode: Node | null = rel.rhs;
  const line = () => `${polyToText(L)} ${op === '<=' ? '≤' : op === '>=' ? '≥' : op} ${polyToText(R)}`;

  // already a product equal to zero: read the solutions off the brackets
  const rhsZero = pIsConst(R) && fIsZero(pConstValue(R) ?? ONE);
  const lhsCore = rel.lhs.t === 'neg' ? rel.lhs.arg : rel.lhs;
  const isProduct =
    (lhsCore.t === 'mul' && lhsCore.args.filter((a) => pDegree(safeRat(a)?.n ?? new Map(), v) >= 1).length >= 2) ||
    (lhsCore.t === 'pow' && lhsCore.base.t === 'add');
  if (!isIneq && rhsZero && isProduct && pDegree(L, v) >= 2) {
    const sol = solveEquation(rel.lhs, rel.rhs, v);
    if (sol && sol.kind === 'finite') {
      out.push({
        line: rootsLine(v, sol.roots),
        why: 'A product is zero only when one of its factors is zero. Set each bracket to zero.',
        tag: 'zero-product',
      });
      return out;
    }
  }

  // 1. clear numeric fractions
  const k = lcmOfDenominators([L, R]);
  if (k > 1n) {
    L = pScale(L, frac(k));
    R = pScale(R, frac(k));
    out.push({ line: line(), why: tr('Multiply every term on both sides by {0} to clear the fractions.', { 0: String(k) }), tag: 'clear-fractions' });
    lhsNode = rhsNode = null;
  }

  // 2. brackets and like terms
  if (lhsNode && rhsNode && !(isCollected(lhsNode) && isCollected(rhsNode))) {
    const hasBrackets = [...terms(lhsNode), ...terms(rhsNode)].some((t) => {
      const core = t.t === 'neg' ? t.arg : t;
      return (core.t === 'mul' && core.args.some((a) => a.t === 'add')) || core.t === 'pow' && core.base.t === 'add' || (t.t === 'neg' && t.arg.t === 'add');
    });
    out.push({
      line: line(),
      why: hasBrackets ? tr('Multiply out the brackets, then collect like terms on each side.') : tr('Collect the like terms on each side.'),
      tag: hasBrackets ? 'expand' : 'collect',
    });
  }

  // unknown only on the right: read the equation the other way round
  if (pDegree(L, v) === 0 && pDegree(R, v) >= 1) {
    [L, R] = [R, L];
    if (isIneq) op = FLIP[op];
  }

  const diff = pSub(L, R);
  const deg = pDegree(diff, v);
  const coeffs = pUniCoeffs(diff, v) ?? [];

  if (deg === 0) {
    const c = pConstValue(diff) ?? ZERO;
    if (!isIneq) {
      out.push(
        fIsZero(c)
          ? { line: 'all real numbers', why: tr('The {0} terms cancel and both sides are identical, so every value works.', { 0: v }), tag: 'final' }
          : { line: tr('no solution'), why: tr('The {0} terms cancel and what is left is false, so no value works.', { 0: v }), tag: 'final' },
      );
    }
    return out;
  }

  if (deg === 1) {
    const a = coeffs[1];
    const b = fNeg(coeffs[0]);
    const lhsOnlyVar = pDegree(L, v) === 1 && !L.has('') && pDegree(R, v) === 0;
    if (!lhsOnlyVar) {
      L = pFromUni([ZERO, a], v);
      R = pConst(b);
      out.push({
        line: line(),
        why: tr('Get the {0} terms on one side and the numbers on the other. A term changes sign when it crosses over.', { 0: v }), tag: 'move',
      });
    }
    if (!fEq(a, ONE)) {
      const negative = fSign(a) < 0;
      if (isIneq && negative) op = FLIP[op];
      L = pFromUni([ZERO, ONE], v);
      R = pConst(fDiv(b, a));
      out.push({
        line: line(),
        why:
          isIneq && negative
            ? tr('Divide both sides by {0}. Dividing by a negative flips the inequality sign.', { 0: fText(a) })
            : tr('Divide both sides by {0}.', { 0: fText(a) }),
        tag: 'divide',
      });
    }
    return out;
  }

  if (isIneq) return out;

  // 3. quadratics and beyond
  const std = pPrimitive(diff).poly;
  const alreadyStd = pIsConst(R) && fIsZero(pConstValue(R) ?? ONE);
  const sc = pUniCoeffs(std, v) as Frac[];
  const { roots } = polyRoots(sc);

  if (deg === 2 && fIsZero(sc[1]) && !fIsZero(sc[0])) {
    // x² = k: no need for standard form, just undo the square
    const kVal = fDiv(fNeg(sc[0]), sc[2]);
    if (fSign(kVal) < 0) {
      out.push({ line: tr('no solution'), why: `${v}² can’t be negative, so no real number works.`, tag: 'final' });
      return out;
    }
    const isolated = L.size === 1 && fEq(L.get(`${v}^2`) ?? ZERO, ONE) && pIsConst(R);
    if (!isolated) out.push({ line: `${v}^2 = ${fText(kVal)}`, why: tr('Get {0}² on its own.', { 0: v }), tag: 'move' });
    out.push({
      line: rootsLine(v, roots),
      why: tr('Take the square root of both sides, a square has a positive and a negative root.'),
      tag: 'sqrt',
    });
    return out;
  }

  if (!alreadyStd) {
    out.push({ line: `${polyToText(std)} = 0`, why: tr('Move everything to one side so the equation equals zero.'), tag: 'standard-form' });
  }

  if (deg === 2) {
    const [c, b, a] = sc;
    const allExact = roots.length > 0 && roots.every((r) => r.exact);
    if (allExact) {
      const f = factorText(std, v);
      if (f && f.changed) {
        const why = fIsZero(c)
          ? tr('Both terms contain {0}, so take it out as a common factor.', { 0: v })
          : fEq(a, ONE)
            ? tr('Factor: find two numbers that multiply to {0} and add to {1}.', { 0: fText(c), 1: fText(b) })
            : tr('Factor: find two numbers that multiply to {0} and add to {1}, then split the middle term.', { 0: fText(fMul(a, c)), 1: fText(b) });
        out.push({ line: `${f.text} = 0`, why, tag: fIsZero(c) ? 'common-factor' : 'factor' });
      }
      out.push({ line: rootsLine(v, roots), why: 'A product is zero only when one of its factors is zero. Set each bracket to zero.', tag: 'zero-product' });
      return out;
    }
    const disc = fSub(fMul(b, b), fMul(frac(4), fMul(a, c)));
    out.push({
      line: `${v} = (${fText(fNeg(b))} ± sqrt(${fText(disc)}))/${fText(fMul(frac(2), a))}`,
      why: tr('This doesn’t factor into whole numbers, so use the quadratic formula with a = {0}, b = {1}, c = {2}.', { 0: fText(a), 1: fText(b), 2: fText(c) }), tag: 'formula',
    });
    out.push(
      roots.length
        ? { line: rootsLine(v, roots), why: tr('Simplify the square root and split into the two answers.'), tag: 'final' }
        : { line: tr('no solution'), why: tr('The number under the square root is negative, so there are no real solutions.'), tag: 'final' },
    );
    return out;
  }

  const f = factorText(std, v);
  if (f && f.changed) out.push({ line: `${f.text} = 0`, why: tr('Factor the left-hand side.'), tag: 'factor' });
  out.push({ line: rootsLine(v, roots), why: tr('Set each factor to zero and solve.'), tag: 'zero-product' });
  return out;
}

/** Multiply everything out but collect nothing: (x+3)(x−2) → x², −2x, 3x, −6. */
function uncollected(n: Node): Poly[] | null {
  switch (n.t) {
    case 'add': {
      const out: Poly[] = [];
      for (const a of n.args) {
        const part = uncollected(a);
        if (!part) return null;
        out.push(...part);
      }
      return out;
    }
    case 'neg': {
      const part = uncollected(n.arg);
      return part ? part.map((p) => pScale(p, frac(-1))) : null;
    }
    case 'mul': {
      let acc: Poly[] = [pConst(ONE)];
      for (const a of n.args) {
        const part = uncollected(a);
        if (!part) return null;
        const next: Poly[] = [];
        for (const x of acc) for (const y of part) next.push(pMulSingle(x, y));
        if (next.length > 40) return null;
        acc = next;
      }
      return acc;
    }
    case 'pow': {
      if (n.base.t === 'add' && n.exp.t === 'num' && fIsInt(n.exp.v) && n.exp.v.n >= 2n && n.exp.v.n <= 3n) {
        const base = uncollected(n.base);
        if (!base) return null;
        let acc = base;
        for (let i = 1n; i < n.exp.v.n; i++) {
          const next: Poly[] = [];
          for (const x of acc) for (const y of base) next.push(pMulSingle(x, y));
          acc = next;
        }
        return acc.length > 40 ? null : acc;
      }
      break;
    }
    default:
      break;
  }
  const r = safeRat(n);
  if (!r || !pIsConst(r.d)) return null;
  return pTerms(r.n).map((t) => new Map([[t.key, t.coef]]) as Poly);
}

function pMulSingle(a: Poly, b: Poly): Poly {
  // both are single-term polynomials
  const r = safeRat({ t: 'num', v: ONE });
  void r;
  const out: Poly = new Map();
  for (const [ka, ca] of a) for (const [kb, cb] of b) {
    const exps: Record<string, number> = {};
    for (const part of [ka, kb]) {
      if (!part) continue;
      for (const f of part.split('*')) {
        const [v, e] = f.split('^');
        exps[v] = (exps[v] ?? 0) + (e ? Number(e) : 1);
      }
    }
    const key = Object.keys(exps).sort().map((v) => (exps[v] === 1 ? v : `${v}^${exps[v]}`)).join('*');
    out.set(key, fMul(ca, cb));
  }
  return out;
}

function joinTerms(parts: Poly[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (p.size === 0) continue;
    const txt = polyToText(p);
    out.push(out.length === 0 ? txt : txt.startsWith('-') ? `- ${txt.slice(1)}` : `+ ${txt}`);
  }
  return out.join(' ') || '0';
}

function commonMonomial(p: Poly): { text: string; rest: Poly } | null {
  const ts = pTerms(p);
  if (ts.length < 2) return null;
  const vars = [...pVars(p)];
  const mins: Record<string, number> = {};
  for (const v of vars) mins[v] = Math.min(...ts.map((t) => t.mono[v] ?? 0));
  const prim = pPrimitive(p);
  const hasVar = vars.some((v) => mins[v] > 0);
  const content = prim.factor;
  const contentTrivial = fEq(content, ONE) || fEq(content, frac(-1));
  if (!hasVar && contentTrivial) return null;
  // divide through
  let rest: Poly = new Map();
  for (const t of pTerms(prim.poly)) {
    const mono: string[] = [];
    for (const v of Object.keys(t.mono).sort()) {
      const e = t.mono[v] - (mins[v] ?? 0);
      if (e > 0) mono.push(e === 1 ? v : `${v}^${e}`);
    }
    rest = pAdd(rest, new Map([[mono.join('*'), t.coef]]));
  }
  const monoText = vars
    .filter((v) => mins[v] > 0)
    .sort()
    .map((v) => (mins[v] === 1 ? v : `${v}^${mins[v]}`))
    .join('');
  const cText = fEq(content, ONE) ? '' : fEq(content, frac(-1)) ? '-' : fIsInt(content) ? content.n.toString() : `(${fText(content)})`;
  return { text: `${cText}${monoText}`, rest };
}

function expressionSteps(prep: Prepared, st: Statement): SolutionStep[] {
  const out: SolutionStep[] = [];
  if (st.kind !== 'expr') return out;
  const kind = prep.problem.kind;
  const e = Object.keys(prep.subs).length ? substitute(st.expr, prep.subs) : st.expr;
  const r = safeRat(e);

  if (kind === 'evaluate') {
    if (Object.keys(prep.subs).length && e !== st.expr) {
      out.push({ line: toText(e), why: tr('Replace each letter with its value. Brackets keep negatives safe.'), tag: 'substitute' });
    }
    if (r && pIsConst(r.d)) {
      const val = pConstValue(r.n);
      if (val) out.push({ line: fText(val), why: tr('Work in order: brackets, powers, then × and ÷, then + and −.'), tag: 'evaluate' });
    }
    return out;
  }

  if (!r) return out;

  if (kind === 'factor') {
    if (!pIsConst(r.d)) return out;
    const vars = [...pVars(r.n)];
    if (vars.length === 1) {
      const cm = commonMonomial(r.n);
      const f = factorText(r.n, vars[0]);
      if (!f) return out;
      if (cm && f.parts.linear.length + (f.parts.rest ? 1 : 0) >= 2 && pDegree(cm.rest) >= 2) {
        out.push({ line: `${cm.text}(${polyToText(cm.rest)})`, why: tr('Every term shares {0}, so take it out first.', { 0: cm.text }), tag: 'common-factor' });
      }
      if (f.changed) {
        const coeffs = pUniCoeffs(pPrimitive(cm ? cm.rest : r.n).poly, vars[0]) ?? [];
        const why =
          coeffs.length === 3 && fIsZero(coeffs[1])
            ? tr('This is a difference of two squares: a² − b² = (a − b)(a + b).')
            : coeffs.length === 3
              ? tr('Find two numbers that multiply to {0} and add to {1}.', { 0: fText(fMul(coeffs[2], coeffs[0])), 1: fText(coeffs[1]) })
              : cm
                ? tr('Every term shares {0}, so take it out.', { 0: cm.text })
                : tr('Factor into brackets.');
        out.push({ line: f.text, why, tag: 'factor' });
      }
      return out;
    }
    const cm = commonMonomial(r.n);
    if (cm) out.push({ line: `${cm.text}(${polyToText(cm.rest)})`, why: tr('Every term shares {0}, so take it out.', { 0: cm.text }), tag: 'common-factor' });
    return out;
  }

  // simplify / expand
  if (pIsConst(r.d)) {
    if (isCollected(e)) return out;
    const final = polyToText(r.n);
    const parts = uncollected(e);
    const written = terms(e).length;
    const needsExpanding = parts !== null && parts.length !== written;
    const needsCollecting = parts === null || parts.length !== (r.n.size || 1);
    if (parts && needsExpanding && needsCollecting) {
      out.push({ line: joinTerms(parts), why: tr('Multiply out each bracket. Every term outside meets every term inside.'), tag: 'expand' });
    }
    out.push(
      needsCollecting
        ? { line: final, why: tr('Collect like terms: add the coefficients of terms with the same letters and powers.'), tag: 'collect' }
        : { line: final, why: tr('Multiply out each bracket. Every term outside meets every term inside.'), tag: 'expand' },
    );
    return out;
  }

  // algebraic fraction: cancel a common factor
  const vars = [...new Set([...pVars(r.n), ...pVars(r.d)])];
  if (vars.length === 1) {
    const n = pUniCoeffs(r.n, vars[0]);
    const dd = pUniCoeffs(r.d, vars[0]);
    if (n && dd) {
      const g = uniGcd(n, dd);
      if (uniDeg(g) >= 1) {
        const fn = factorText(r.n, vars[0]);
        const fd = factorText(r.d, vars[0]);
        if (fn && fd) out.push({ line: `(${fn.text})/(${fd.text})`, why: tr('Factor the top and the bottom completely.'), tag: 'factor' });
        const qn = pFromUni(uniDivMod(n, g).q, vars[0]);
        const qd = pFromUni(uniDivMod(dd, g).q, vars[0]);
        const dConst = pConstValue(qd);
        const line = dConst ? polyToText(pScale(qn, fDiv(ONE, dConst))) : `(${polyToText(qn)})/(${polyToText(qd)})`;
        out.push({ line, why: tr('Cancel the factor that appears on both the top and the bottom.'), tag: 'cancel' });
      }
    }
  }
  return out;
}

function systemSteps(prep: Prepared): SolutionStep[] {
  if (!prep.system) return [];
  const line = prep.vars.map((x) => `${x} = ${fText(prep.system![x])}`).join(', ');
  return [
    {
      line,
      why: tr('Make the coefficients of one letter match, add or subtract the equations to eliminate it, solve for the other letter, then substitute back.'),
      tag: 'system',
    },
  ];
}

/** Clean route from `from` (default: the problem itself) to the answer. */
export function solutionSteps(prep: Prepared, from?: Statement): SolutionStep[] {
  const st = from ?? prep.given;
  try {
    switch (prep.mode) {
      case 'eq':
        return equationSteps(prep, st, false);
      case 'ineq':
        return equationSteps(prep, st, true);
      case 'expr':
        return expressionSteps(prep, st);
      case 'system':
        return systemSteps(prep);
      default:
        return [];
    }
  } catch {
    return [];
  }
}

export function nextStep(prep: Prepared, from: Statement): SolutionStep | null {
  return solutionSteps(prep, from)[0] ?? null;
}

export { statementToText };
