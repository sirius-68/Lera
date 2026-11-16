import {
  Node, Relation, Statement, add, containsType, div, fromTerms, lit, mul, neg, negate, num, pow, replaceAt,
  statementToText, terms, toText, variablesOf, walk,
} from './ast';
import { Prepared, numericLiterals, relate, safeRat } from './check';
import { polyToText } from './format';
import { Frac, ONE, fAdd, fDiv, fEq, fIsInt, fIsZero, fMul, fNum, frac, snapToFrac } from './frac';
import { evalNum, pConstValue, pDegree, pIsConst, pPrimitive, pUniCoeffs, pVars, rSub } from './poly';
import { FLIP, closeTo, statementSolutions } from './solve';
import { ConceptId, Diagnosis, ProblemKind, Severity } from './types';

/**
 * Why a line doesn't follow from the one above it.
 *
 * The method is the classic "mal-rule" one: apply each well-known *wrong*
 * transformation to the previous line and see whether it reproduces what the
 * student wrote. If it does, we know not just that the step is wrong but which
 * misconception produced it — and therefore which topic to send them back to.
 */

type Draft = Omit<Diagnosis, 'fix'>;
interface Candidate {
  st: Statement;
  diag: () => Draft;
}

const m = (n: Node | string): string => `$${typeof n === 'string' ? n : toText(n)}$`;

function d(code: string, concept: ConceptId, severity: Severity, title: string, message: string): Draft {
  return { code, concept, severity, title, message };
}

/** Rebuild a statement with one side (or the whole expression) replaced. */
type Site = { root: Node; rebuild: (n: Node) => Statement };

function sites(st: Statement): Site[] {
  if (st.kind === 'expr') return [{ root: st.expr, rebuild: (e) => ({ kind: 'expr', expr: e }) }];
  if (st.kind !== 'rel') return [];
  const out: Site[] = [];
  st.rels.forEach((r, i) => {
    out.push({ root: r.lhs, rebuild: (e) => ({ ...st, rels: st.rels.map((q, j) => (j === i ? { ...q, lhs: e } : q)) }) });
    out.push({ root: r.rhs, rebuild: (e) => ({ ...st, rels: st.rels.map((q, j) => (j === i ? { ...q, rhs: e } : q)) }) });
  });
  return out;
}

type NodeRule = (n: Node) => { node: Node; diag: () => Draft }[];

function* fromNodeRule(st: Statement, rule: NodeRule): Generator<Candidate> {
  for (const site of sites(st)) {
    const found: { path: number[]; node: Node; diag: () => Draft }[] = [];
    walk(site.root, (x, p) => {
      for (const r of rule(x)) found.push({ path: p, ...r });
    });
    for (const f of found) yield { st: site.rebuild(replaceAt(site.root, f.path, f.node)), diag: f.diag };
  }
}

const expanded = (n: Node): string => {
  const r = safeRat(n);
  return r && pIsConst(r.d) ? polyToText(r.n) : toText(n);
};

/* ───────────── node-level mal-rules ───────────── */

/** k(a + b) → ka + b,  k(a − b) → ka − kb with a wrong sign,  −(a + b) → −a + b,  (a+b)(c+d) → ac + bd */
const distributionRule: NodeRule = (n) => {
  const out: { node: Node; diag: () => Draft }[] = [];
  let k: Node | null = null;
  let sum: Node | null = null;
  let twoSums: [Node, Node] | null = null;

  if (n.t === 'neg' && n.arg.t === 'add') {
    k = neg(num(1));
    sum = n.arg;
  } else if (n.t === 'neg' && n.arg.t === 'mul' && n.arg.args.filter((a) => a.t === 'add').length === 1 && n.arg.args.length >= 2) {
    // -k(a + b): the minus belongs to the multiplier
    const rest = n.arg.args.filter((a) => a.t !== 'add');
    k = neg(rest.length === 1 ? rest[0] : mul(...rest));
    sum = n.arg.args.find((a) => a.t === 'add') as Node;
  } else if (n.t === 'mul') {
    const sums = n.args.filter((a) => a.t === 'add');
    const rest = n.args.filter((a) => a.t !== 'add');
    if (sums.length === 1 && rest.length >= 1) {
      k = rest.length === 1 ? rest[0] : mul(...rest);
      sum = sums[0];
    } else if (sums.length === 2 && rest.length === 0) {
      twoSums = [sums[0], sums[1]];
    }
  }

  if (k && sum && sum.t === 'add') {
    const s = sum.args;
    const isBareMinus = n.t === 'neg' && n.arg.t === 'add';
    const times = (t: Node): Node => (isBareMinus ? negate(t) : mul(k as Node, t));
    const whole = toText(n);
    // only the first term gets multiplied
    out.push({
      node: add(times(s[0]), ...s.slice(1)),
      diag: () =>
        isBareMinus
          ? d(
              'distribute-negative',
              'distributive',
              'gap',
              'A minus in front flips every sign inside.',
              `In ${m(whole)} the minus applies to the whole bracket, so every term changes sign: ${m(expanded(n))}.`,
            )
          : d(
              'distribute-first-only',
              'distributive',
              'gap',
              'The number outside multiplies everything inside.',
              `In ${m(whole)} you multiplied the first term but not the rest. ${m(k as Node)} has to reach every term in the bracket: ${m(expanded(n))}.`,
            ),
    });
    // one product carries the wrong sign
    for (let j = 1; j < s.length; j++) {
      const parts = s.map((t, i) => (i === j ? negate(times(t)) : times(t)));
      const kNeg = isBareMinus || (k as Node).t === 'neg';
      out.push({
        node: add(...parts),
        diag: () =>
          d(
            'distribute-sign',
            'distributive',
            kNeg ? 'gap' : 'slip',
            kNeg ? 'A negative outside flips the signs inside.' : 'Watch the sign when you multiply out.',
            `${m(isBareMinus ? '-1' : (k as Node))} times ${m(s[j])} is ${m(expanded(times(s[j])))}. Multiplying out ${m(whole)} gives ${m(expanded(n))}.`,
          ),
      });
    }
  }

  if (twoSums) {
    const [a, b] = twoSums;
    if (a.t === 'add' && b.t === 'add' && a.args.length === 2 && b.args.length === 2) {
      out.push({
        node: add(mul(a.args[0], b.args[0]), mul(a.args[1], b.args[1])),
        diag: () =>
          d(
            'foil-partial',
            'expanding-binomials',
            'gap',
            'Every term meets every term.',
            `${m(n)} makes four products, not two. You have first × first and last × last, but the two cross terms are missing: ${m(expanded(n))}.`,
          ),
      });
    }
  }
  return out;
};

function baseAndExp(n: Node): { base: string; exp: Frac } | null {
  if (n.t === 'var') return { base: n.name, exp: ONE };
  if (n.t === 'pow' && n.base.t === 'var' && n.exp.t === 'num') return { base: n.base.name, exp: n.exp.v };
  return null;
}

const exponentRule: NodeRule = (n) => {
  const out: { node: Node; diag: () => Draft }[] = [];

  // (a ± b)^n → a^n ± b^n
  if (n.t === 'pow' && n.base.t === 'add' && n.exp.t === 'num' && fIsInt(n.exp.v) && n.exp.v.n >= 2n) {
    const ts = n.base.args;
    const e = n.exp;
    const diag = () =>
      d(
        'power-of-sum',
        'expanding-binomials',
        'gap',
        'A power doesn’t share out over a sum.',
        `${m(n)} means the bracket times itself, so there are cross terms: ${m(expanded(n))}. Squaring each term separately leaves them out.`,
      );
    out.push({ node: add(...ts.map((t) => (t.t === 'neg' ? neg(pow(t.arg, e)) : pow(t, e)))), diag });
    out.push({ node: add(...ts.map((t) => pow(t.t === 'neg' ? t.arg : t, e))), diag });
  }

  // x^a · x^b → x^(ab);  x · x → 2x
  if (n.t === 'mul') {
    const idx: number[] = [];
    const info = n.args.map((a) => baseAndExp(a));
    for (let i = 0; i < n.args.length; i++) {
      for (let j = i + 1; j < n.args.length; j++) {
        const A = info[i];
        const B = info[j];
        if (!A || !B || A.base !== B.base) continue;
        idx.push(i, j);
        const rest = n.args.filter((_, q) => q !== i && q !== j);
        const base: Node = { t: 'var', name: A.base };
        const prod = fMul(A.exp, B.exp);
        const sum = fAdd(A.exp, B.exp);
        if (!fEq(prod, sum)) {
          out.push({
            node: mul(...rest, pow(base, lit(prod))),
            diag: () =>
              d(
                'exp-product-multiplied',
                'exponent-rules',
                'gap',
                'Multiplying powers adds the exponents.',
                `${m(mul(n.args[i], n.args[j]))} is ${m(pow(base, lit(sum)))}, not ${m(pow(base, lit(prod)))}. You count how many times ${m(base)} is multiplied in total.`,
              ),
          });
        }
        if (fEq(A.exp, ONE) && fEq(B.exp, ONE)) {
          out.push({
            node: mul(...rest, num(2), base),
            diag: () =>
              d(
                'x-times-x',
                'exponent-rules',
                'gap',
                `${A.base} times ${A.base} is ${A.base}², not 2${A.base}.`,
                `Adding gives ${m(`2${A.base}`)}; multiplying gives ${m(`${A.base}^2`)}. Here the two are multiplied.`,
              ),
          });
        }
      }
    }
  }

  // (x^a)^b → x^(a+b)
  if (n.t === 'pow' && n.base.t === 'pow' && n.exp.t === 'num' && n.base.exp.t === 'num') {
    const inner = n.base;
    const sum = fAdd(n.exp.v, (inner.exp as { t: 'num'; v: Frac }).v);
    const prod = fMul(n.exp.v, (inner.exp as { t: 'num'; v: Frac }).v);
    if (!fEq(sum, prod)) {
      out.push({
        node: pow(inner.base, lit(sum)),
        diag: () =>
          d(
            'exp-power-added',
            'exponent-rules',
            'gap',
            'A power of a power multiplies.',
            `${m(n)} is ${m(pow(inner.base, lit(prod)))}: the inside power is repeated ${m(n.exp)} times.`,
          ),
      });
    }
  }

  // (kx)^n → k·x^n
  if (n.t === 'pow' && n.base.t === 'mul' && n.exp.t === 'num' && fIsInt(n.exp.v) && n.exp.v.n >= 2n) {
    const nums = n.base.args.filter((a) => a.t === 'num');
    const others = n.base.args.filter((a) => a.t !== 'num');
    if (nums.length === 1 && others.length >= 1) {
      out.push({
        node: mul(nums[0], ...others.map((o) => pow(o, n.exp))),
        diag: () =>
          d(
            'power-of-product',
            'exponent-rules',
            'gap',
            'The power applies to the number too.',
            `In ${m(n)} everything inside the bracket is raised to the power, including the ${m(nums[0])}: ${m(expanded(n))}.`,
          ),
      });
    }
  }

  // x^a / x^b → x^(a/b)
  if (n.t === 'div') {
    const A = baseAndExp(n.num);
    const B = baseAndExp(n.den);
    if (A && B && A.base === B.base && !fIsZero(B.exp)) {
      const quot = fDiv(A.exp, B.exp);
      const base: Node = { t: 'var', name: A.base };
      out.push({
        node: pow(base, lit(quot)),
        diag: () =>
          d(
            'exp-quotient-divided',
            'exponent-rules',
            'gap',
            'Dividing powers subtracts the exponents.',
            `${m(n)} is ${m(expanded(n))}: each ${m(base)} underneath cancels one on top.`,
          ),
      });
    }
  }

  // x^(−n) → −x^n
  if (n.t === 'pow' && n.exp.t === 'neg') {
    out.push({
      node: neg(pow(n.base, n.exp.arg)),
      diag: () =>
        d(
          'negative-exponent',
          'exponent-rules',
          'gap',
          'A negative power means “one over”.',
          `${m(n)} is ${m(div(num(1), pow(n.base, (n.exp as { t: 'neg'; arg: Node }).arg)))}. The minus in the power doesn’t make the answer negative.`,
        ),
    });
  }

  // (−a)^2 → −a^2   and   −a^2 → a^2
  if (n.t === 'pow' && n.base.t === 'neg' && n.exp.t === 'num' && fIsInt(n.exp.v) && n.exp.v.n % 2n === 0n) {
    out.push({
      node: neg(pow(n.base.arg, n.exp)),
      diag: () =>
        d(
          'neg-square',
          'signed-arithmetic',
          'gap',
          'A negative squared is positive.',
          `${m(n)} is ${m(pow(n.base, n.exp))}, two negatives multiplied, so the result is positive.`,
        ),
    });
  }
  if (n.t === 'neg' && n.arg.t === 'pow' && n.arg.exp.t === 'num' && fIsInt(n.arg.exp.v) && n.arg.exp.v.n % 2n === 0n) {
    const p = n.arg;
    out.push({
      node: p,
      diag: () =>
        d(
          'neg-square',
          'order-of-operations',
          'gap',
          'Without brackets, the power comes before the minus.',
          `${m(n)} squares first and then takes the negative. To square the negative number itself you need ${m(pow(neg(p.base), p.exp))}.`,
        ),
    });
  }
  return out;
};

/** Single-term view of a node: coefficient × monomial key. */
function monomialOf(n: Node): { coef: Frac; key: string; deg: number } | null {
  const r = safeRat(n);
  if (!r || !pIsConst(r.d)) return null;
  if (r.n.size !== 1) return null;
  const [key, coef] = [...r.n.entries()][0];
  return { coef, key, deg: pDegree(r.n) };
}

function monoFromKey(key: string): Node | null {
  if (!key) return null;
  const parts = key.split('*').map((p): Node => {
    const [v, e] = p.split('^');
    return e ? pow({ t: 'var', name: v }, num(Number(e))) : { t: 'var', name: v };
  });
  return parts.length === 1 ? parts[0] : mul(...parts);
}

function coefTimes(c: Frac, mono: Node | null): Node {
  if (!mono) return lit(c);
  if (fEq(c, ONE)) return mono;
  if (fEq(c, frac(-1))) return neg(mono);
  const body = fIsInt(c) ? mul(lit({ n: c.n < 0n ? -c.n : c.n, d: 1n }), mono) : mul(lit({ n: c.n < 0n ? -c.n : c.n, d: c.d }), mono);
  return c.n < 0n ? neg(body) : body;
}

/** 2x + 3 → 5x;  2x + 3x → 5x²;  2x + 3x → 6x */
const combineRule: NodeRule = (n) => {
  const out: { node: Node; diag: () => Draft }[] = [];
  if (n.t !== 'add') return out;
  const info = n.args.map(monomialOf);
  for (let i = 0; i < n.args.length; i++) {
    for (let j = i + 1; j < n.args.length; j++) {
      const A = info[i];
      const B = info[j];
      if (!A || !B) continue;
      const rest = n.args.filter((_, q) => q !== i && q !== j);
      const place = (x: Node) => fromTerms([...n.args.slice(0, i), x, ...n.args.slice(i + 1).filter((_, q) => q + i + 1 !== j)]);
      void rest;
      if (A.key !== B.key) {
        const hi = A.deg >= B.deg ? A : B;
        const sum = fAdd(A.coef, B.coef);
        if (fIsZero(sum)) continue;
        out.push({
          node: place(coefTimes(sum, monoFromKey(hi.key))),
          diag: () =>
            d(
              'combine-unlike',
              'like-terms',
              'gap',
              'Only like terms can be combined.',
              `${m(n.args[i])} and ${m(n.args[j])} are different kinds of term, so they can’t be added into one. They stay separate.`,
            ),
        });
      } else if (A.key) {
        const mono = monoFromKey(A.key) as Node;
        const sum = fAdd(A.coef, B.coef);
        out.push({
          node: place(coefTimes(sum, mul(mono, mono))),
          diag: () =>
            d(
              'add-exponents-when-adding',
              'like-terms',
              'gap',
              'Adding like terms doesn’t change the power.',
              `${m(add(n.args[i], n.args[j]))} is ${m(coefTimes(sum, mono))}. The power only changes when you multiply.`,
            ),
        });
        if (!fIsZero(sum)) {
          out.push({
            node: place(lit(sum)),
            diag: () =>
              d(
                'dropped-variable',
                'like-terms',
                'slip',
                'The letter went missing.',
                `${m(add(n.args[i], n.args[j]))} is ${m(coefTimes(sum, mono))}, not ${m(lit(sum))}. Adding like terms adds the numbers in front; the letter part stays.`,
              ),
          });
        }
        out.push({
          node: place(coefTimes(fMul(A.coef, B.coef), mono)),
          diag: () =>
            d(
              'multiplied-when-adding',
              'like-terms',
              'slip',
              'These are added, not multiplied.',
              `${m(add(n.args[i], n.args[j]))} adds the coefficients: ${m(coefTimes(sum, mono))}.`,
            ),
        });
      }
    }
  }
  return out;
};

/** a/b + c/d → (a+c)/(b+d);  (x+3)/3 → x  or  x+1;  (a+b)/k → a/k + b */
const fractionRule: NodeRule = (n) => {
  const out: { node: Node; diag: () => Draft }[] = [];
  if (n.t === 'add') {
    for (let i = 0; i < n.args.length; i++) {
      for (let j = i + 1; j < n.args.length; j++) {
        const a = n.args[i];
        const bRaw = n.args[j];
        const b = bRaw.t === 'neg' ? bRaw.arg : bRaw;
        if (a.t !== 'div' || b.t !== 'div') continue;
        const top = bRaw.t === 'neg' ? add(a.num, neg(b.num)) : add(a.num, b.num);
        const bottom = bRaw.t === 'neg' ? add(a.den, neg(b.den)) : add(a.den, b.den);
        const both = fromTerms([...n.args.slice(0, i), div(top, bottom), ...n.args.filter((_, q) => q > i && q !== j)]);
        out.push({
          node: both,
          diag: () =>
            d(
              'add-fractions-straight',
              'fractions',
              'gap',
              'Fractions need a common denominator first.',
              `You can’t add tops and bottoms separately. Rewrite ${m(a)} and ${m(b)} over the same denominator, then add the tops only.`,
            ),
        });
      }
    }
  }
  if (n.t === 'div' && n.num.t === 'add') {
    const ts = n.num.args;
    ts.forEach((t, i) => {
      const others = ts.filter((_, q) => q !== i);
      const same = safeRat(t) && safeRat(n.den) && relateNodes(t, n.den);
      if (same) {
        const diag = () =>
          d(
            'cancel-term',
            'fractions',
            'gap',
            'You can cancel factors, not terms.',
            `In ${m(n)} the ${m(t)} on top is added to something, so it can’t cancel on its own. The bottom divides the whole top.`,
          );
        out.push({ node: fromTerms(others), diag });
        out.push({ node: fromTerms(ts.map((x, q) => (q === i ? num(1) : x))), diag });
      }
      out.push({
        node: fromTerms(ts.map((x, q) => (q === i ? div(x, n.den) : x))),
        diag: () =>
          d(
            'divide-one-term',
            'fractions',
            'gap',
            'The denominator divides every term on top.',
            `${m(n)} means each term of the top is divided by ${m(n.den)}, not only ${m(t)}.`,
          ),
      });
    });
  }
  return out;
};

function relateNodes(a: Node, b: Node): boolean {
  const ra = safeRat(a);
  const rb = safeRat(b);
  if (!ra || !rb) return false;
  try {
    const diff = rSub(ra, rb);
    return diff.n.size === 0;
  } catch {
    return false;
  }
}

/** 2 + 3 × 4 → (2 + 3) × 4;  2 · 3² → (2·3)² */
const orderRule: NodeRule = (n) => {
  const out: { node: Node; diag: () => Draft }[] = [];
  if (n.t === 'add') {
    n.args.forEach((a, k) => {
      const core = a.t === 'neg' ? a.arg : a;
      if (k === 0 || core.t !== 'mul') return;
      const before = fromTerms(n.args.slice(0, k));
      const first = a.t === 'neg' ? neg(core.args[0]) : core.args[0];
      const grouped = mul(add(...terms(before), first), ...core.args.slice(1));
      out.push({
        node: fromTerms([grouped, ...n.args.slice(k + 1)]),
        diag: () =>
          d(
            'order-of-operations',
            'order-of-operations',
            'gap',
            'Multiplication comes before addition.',
            `In ${m(n)} work out ${m(core)} first, then add. Going strictly left to right gives a different number.`,
          ),
      });
    });
  }
  if (n.t === 'mul' && n.args.length === 2 && n.args[1].t === 'pow') {
    const p = n.args[1];
    out.push({
      node: pow(mul(n.args[0], p.base), p.exp),
      diag: () =>
        d(
          'order-power',
          'order-of-operations',
          'gap',
          'Powers come before multiplication.',
          `In ${m(n)} only ${m(p.base)} is raised to the power. Work out ${m(p)} first, then multiply.`,
        ),
    });
  }
  return out;
};

/* ───────────── equation-level mal-rules ───────────── */

interface SideTerm {
  side: 'lhs' | 'rhs';
  node: Node;
}

function sideTerms(r: Relation): SideTerm[] {
  return [
    ...terms(r.lhs).map((node): SideTerm => ({ side: 'lhs', node })),
    ...terms(r.rhs).map((node): SideTerm => ({ side: 'rhs', node })),
  ];
}

function rebuildRel(r: Relation, ts: SideTerm[]): Relation {
  return {
    op: r.op,
    lhs: fromTerms(ts.filter((t) => t.side === 'lhs').map((t) => t.node)),
    rhs: fromTerms(ts.filter((t) => t.side === 'rhs').map((t) => t.node)),
  };
}

const one = (r: Relation): Statement => ({ kind: 'rel', rels: [r], join: 'or' });

/** Flip the sign of one term: what "moving it across without changing sign" produces. */
function* signFlipCandidates(prev: Statement, cur: Statement): Generator<Candidate> {
  if (prev.kind === 'expr') {
    const ts = terms(prev.expr);
    if (ts.length < 2) return;
    for (let i = 0; i < ts.length; i++) {
      const flipped = ts.map((t, q) => (q === i ? negate(t) : t));
      yield {
        st: { kind: 'expr', expr: fromTerms(flipped) },
        diag: () =>
          d(
            'sign-slip',
            'signed-arithmetic',
            'slip',
            'A sign changed between lines.',
            `${m(ts[i])} turned into ${m(negate(ts[i]))}. Nothing was done to that term, so its sign should stay the same.`,
          ),
      };
    }
    return;
  }
  if (prev.kind !== 'rel' || prev.rels.length !== 1) return;
  const r = prev.rels[0];
  const ts = sideTerms(r);
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const flipped = ts.map((x, q) => (q === i ? { ...x, node: negate(x.node) } : x));
    yield {
      st: one(rebuildRel(r, flipped)),
      diag: () => {
        // did the term stay on its side (copying slip) or cross over (transposition error)?
        const stayed = termStillOnSide(t, cur);
        if (stayed) {
          return d(
            'sign-copy',
            'signed-arithmetic',
            'slip',
            'A sign changed between lines.',
            `${m(t.node)} became ${m(negate(t.node))} without anything being done to it. Copy the sign across carefully.`,
          );
        }
        const was = t.node.t === 'neg' ? 'subtracted' : 'added';
        const undo = t.node.t === 'neg' ? 'add' : 'subtract';
        const bare = t.node.t === 'neg' ? t.node.arg : t.node;
        return d(
          'transpose-sign',
          'inverse-operations',
          'gap',
          'A term changes sign when it crosses the equals sign.',
          `${m(bare)} was ${was} on the ${t.side === 'lhs' ? 'left' : 'right'}. To move it you ${undo} ${m(bare)} on both sides, so it arrives on the other side as ${m(negate(t.node))}.`,
        );
      },
    };
  }
}

function termStillOnSide(t: SideTerm, cur: Statement): boolean {
  if (cur.kind !== 'rel' || cur.rels.length !== 1) return false;
  const mono = monomialOf(t.node);
  if (!mono) return false;
  const side = safeRat(t.side === 'lhs' ? cur.rels[0].lhs : cur.rels[0].rhs);
  const otherSide = safeRat(t.side === 'lhs' ? cur.rels[0].rhs : cur.rels[0].lhs);
  if (!side || !otherSide) return false;
  const here = side.n.get(mono.key);
  const there = otherSide.n.get(mono.key);
  // a constant that "stays" must still be a constant on the same side and absent across
  return !!here && !there;
}

/** Coefficients of variable terms, the numbers people divide by. */
function variableCoefficients(ts: SideTerm[]): Frac[] {
  const out: Frac[] = [];
  for (const t of ts) {
    const mono = monomialOf(t.node);
    if (!mono || !mono.key) continue;
    if (!fIsInt(mono.coef)) continue; // a fractional coefficient is cleared by multiplying, handled elsewhere
    const abs = mono.coef.n < 0n ? { n: -mono.coef.n, d: mono.coef.d } : mono.coef;
    if (!fEq(abs, ONE) && !out.some((x) => fEq(x, abs))) out.push(abs);
    if (mono.coef.n < 0n && !out.some((x) => fEq(x, mono.coef))) out.push(mono.coef);
  }
  return out;
}

function* coefficientCandidates(prev: Statement): Generator<Candidate> {
  if (prev.kind !== 'rel' || prev.rels.length !== 1) return;
  const r = prev.rels[0];
  // a·x = c style slips: subtracting the coefficient, multiplying instead, inverting
  const L = monomialOf(r.lhs);
  const R = monomialOf(r.rhs);
  const pairs: { coefSide: typeof L; constSide: typeof R; v: string }[] = [];
  if (L && R && L.key && !R.key && pDegreeKey(L.key) === 1) pairs.push({ coefSide: L, constSide: R, v: L.key });
  if (L && R && R.key && !L.key && pDegreeKey(R.key) === 1) pairs.push({ coefSide: R, constSide: L, v: R.key });
  for (const p of pairs) {
    const a = p.coefSide!.coef;
    const c = p.constSide!.coef;
    if (fEq(a, ONE)) continue;
    const x: Node = { t: 'var', name: p.v };
    const mk = (val: Frac): Statement => one({ op: r.op, lhs: x, rhs: lit(val) });
    const term = toText(p.coefSide === L ? r.lhs : r.rhs);
    const isFraction = !fIsInt(a);
    yield {
      st: mk(fAdd(c, { n: -a.n, d: a.d })),
      diag: () =>
        d(
          'subtracted-coefficient',
          'inverse-operations',
          'gap',
          'Undo multiplying by dividing.',
          `In ${m(term)} the ${m(lit(a))} multiplies ${m(x)}. Subtracting it doesn’t undo that, divide both sides by ${m(lit(a))} instead.`,
        ),
    };
    yield {
      st: mk(fMul(c, a)),
      diag: () =>
        d(
          'multiplied-coefficient',
          'inverse-operations',
          'gap',
          'Use the opposite operation.',
          isFraction
            ? `${m(x)} is being divided here, so undo it by multiplying both sides.`
            : `${m(x)} is being multiplied by ${m(lit(a))}, so undo it by dividing both sides by ${m(lit(a))}.`,
        ),
    };
    if (!fIsZero(c)) {
      yield {
        st: mk(fDiv(a, c)),
        diag: () =>
          d(
            'inverted-quotient',
            'balance',
            'slip',
            'That division is upside down.',
            `Dividing both sides of ${m(statementToText(prev))} by ${m(lit(a))} gives ${m(x)} = ${m(lit(fDiv(c, a)))}.`,
          ),
      };
    }
    yield {
      st: mk({ n: -fDiv(c, a).n, d: fDiv(c, a).d }),
      diag: () =>
        d(
          'sign-in-division',
          'signed-arithmetic',
          'slip',
          'Check the sign of that division.',
          `${m(lit(c))} divided by ${m(lit(a))} is ${m(lit(fDiv(c, a)))}. Same signs give a positive, different signs give a negative.`,
        ),
    };
  }
}

/** Dividing some terms by k but not all of them. */
function* partialDivisionCandidates(prev: Statement): Generator<Candidate> {
  if (prev.kind !== 'rel' || prev.rels.length !== 1) return;
  const r = prev.rels[0];
  const ts = sideTerms(r);
  if (ts.length > 6 || ts.length < 2) return;
  const ks = variableCoefficients(ts);
  const subsets = 1 << ts.length;
  for (const k of ks) {
    for (let mask = 1; mask < subsets - 1; mask++) {
      const next = ts.map((t, i) => (mask & (1 << i) ? { ...t, node: div(t.node, lit(k)) } : t));
      yield {
        st: one(rebuildRel(r, next)),
        diag: () =>
          d(
            'divide-partial',
            'balance',
            'gap',
            'Divide every term, not just some.',
            `Dividing by ${m(lit(k))} has to happen to each term on both sides. Here some terms were divided and others weren’t.`,
          ),
      };
    }
  }
}

function pDegreeKey(key: string): number {
  return key.split('*').reduce((s, p) => s + (p.includes('^') ? Number(p.split('^')[1]) : 1), 0);
}

function numericDenominators(n: Node, out: Frac[] = []): Frac[] {
  walk(n, (x) => {
    if (x.t === 'div' && x.den.t === 'num' && !out.some((o) => fEq(o, (x.den as { t: 'num'; v: Frac }).v))) out.push(x.den.v);
  });
  return out;
}

function* clearingCandidates(prev: Statement): Generator<Candidate> {
  if (prev.kind !== 'rel' || prev.rels.length !== 1) return;
  const r = prev.rels[0];
  const dens = [...numericDenominators(r.lhs), ...numericDenominators(r.rhs)];
  if (dens.length === 0) return;
  const ts = sideTerms(r);
  if (ts.length > 6 || ts.length < 2) return;
  let lcm = 1n;
  for (const x of dens) if (fIsInt(x)) lcm = (lcm * x.n) / gcd(lcm, x.n);
  const ks = [...dens];
  if (!ks.some((x) => fEq(x, frac(lcm)))) ks.push(frac(lcm));
  const subsets = 1 << ts.length;
  for (const k of ks) {
    for (let mask = 1; mask < subsets - 1; mask++) {
      const next = ts.map((t, i) => (mask & (1 << i) ? { ...t, node: mul(lit(k), t.node) } : t));
      yield {
        st: one(rebuildRel(r, next)),
        diag: () =>
          d(
            'multiply-partial',
            'clearing-fractions',
            'gap',
            'Multiply every term when clearing a fraction.',
            `Multiplying by ${m(lit(k))} to remove the fraction has to hit every term on both sides, including the ones that weren’t fractions.`,
          ),
      };
    }
  }
}

function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

/* ───────────── solution-set and factoring diagnoses ───────────── */

function hasProductOfSums(n: Node): boolean {
  let found = false;
  walk(n, (x) => {
    if (x.t === 'mul' && x.args.some((a) => a.t === 'add')) found = true;
    if (x.t === 'pow' && x.base.t === 'add') found = true;
  });
  return found;
}

function statementHas(st: Statement, test: (n: Node) => boolean): boolean {
  if (st.kind === 'expr') return test(st.expr);
  if (st.kind === 'rel') return st.rels.some((r) => test(r.lhs) || test(r.rhs));
  return false;
}

function rootsDiagnosis(prep: Prepared, prev: Statement, cur: Statement): Draft | null {
  if (prep.mode !== 'eq') return null;
  const P = statementSolutions(prev, prep.v);
  const C = statementSolutions(cur, prep.v);
  if (!P || !C || P.kind !== 'finite' || C.kind !== 'finite') return null;
  const inC = (x: number) => C.roots.some((r) => closeTo(r.value, x));
  const inP = (x: number) => P.roots.some((r) => closeTo(r.value, x));
  const v = prep.v;

  if (P.roots.length >= 2 && C.roots.length >= 1 && C.roots.every((r) => inP(r.value)) && C.roots.length < P.roots.length) {
    const missing = P.roots.filter((r) => !inC(r.value));
    const kept = C.roots;
    // x² = k written as a single root
    if (missing.length === 1 && kept.length === 1 && closeTo(missing[0].value, -kept[0].value) && kept[0].value !== 0) {
      return d(
        'sqrt-pm',
        'square-root-pm',
        'gap',
        'A square has two roots.',
        `Both ${m(`${v} = ${kept[0].text}`)} and ${m(`${v} = ${missing[0].text}`)} make the line above true, because squaring removes the sign. Keep both: ${m(`${v} = ±${kept[0].value > 0 ? kept[0].text : missing[0].text}`)}.`,
      );
    }
    if (missing.some((r) => r.value === 0)) {
      return d(
        'divided-by-variable',
        'dividing-by-variable',
        'gap',
        `Dividing by ${v} threw away ${v} = 0.`,
        `Dividing both sides by ${m(v)} is only safe when ${m(v)} can’t be zero, and here ${m(`${v} = 0`)} was a solution. Bring everything to one side and factor instead.`,
      );
    }
    return d(
      'lost-solution',
      'zero-product',
      'gap',
      'One solution went missing.',
      `The line above is true for ${missing.concat(kept).map((r) => m(`${v} = ${r.text}`)).join(' and ')}. This line only keeps ${kept.map((r) => m(`${v} = ${r.text}`)).join(' and ')}.`,
    );
  }

  if (P.roots.length >= 1 && C.roots.length > P.roots.length && P.roots.every((r) => inC(r.value))) {
    const extra = C.roots.filter((r) => !inP(r.value));
    return d(
      'extra-solution',
      'zero-product',
      'gap',
      'This line lets in a value the one above doesn’t.',
      `${extra.map((r) => m(`${v} = ${r.text}`)).join(' and ')} doesn’t satisfy the line above. Check it by substituting back.`,
    );
  }

  // every root has the wrong sign
  const negated =
    P.roots.length === C.roots.length &&
    P.roots.length >= 1 &&
    P.roots.every((r) => inC(-r.value)) &&
    P.roots.some((r) => r.value !== 0);
  if (negated && (P.roots.length >= 2 || statementHas(prev, hasProductOfSums))) {
    if (statementHas(cur, hasProductOfSums) && !statementHas(prev, hasProductOfSums)) {
      return d(
        'factor-sign',
        'factoring',
        'gap',
        'Check the signs inside the brackets.',
        `Multiply your brackets back out and compare with the line above, the middle term comes out with the opposite sign. Swap the signs in the brackets.`,
      );
    }
    return d(
      'factor-root-sign',
      'zero-product',
      'gap',
      'The solution has the opposite sign to the number in the bracket.',
      `A bracket like ${m(`(${v} - 2)`)} is zero when ${m(`${v} = 2`)}, not ${m(`${v} = -2`)}. Set each bracket equal to zero and solve it.`,
    );
  }
  return null;
}

/** Compare an attempted factorisation with the quadratic it should multiply back to. */
function factoringDiagnosis(prev: Node, cur: Node): Draft | null {
  if (!hasProductOfSums(cur) || hasProductOfSums(prev)) return null;
  const P = safeRat(prev);
  const C = safeRat(cur);
  if (!P || !C || !pIsConst(P.d) || !pIsConst(C.d)) return null;
  const vars = [...pVars(P.n)];
  if (vars.length !== 1) return null;
  const a = pUniCoeffs(P.n, vars[0]);
  const b = pUniCoeffs(C.n, vars[0]);
  if (!a || !b || a.length !== 3 || b.length !== 3) return null;
  const sameLead = fEq(a[2], b[2]);
  if (!sameLead) return null;
  const back = polyToText(C.n);
  if (fEq(a[0], b[0]) && fEq(a[1], { n: -b[1].n, d: b[1].d })) {
    return d(
      'factor-sign',
      'factoring',
      'gap',
      'Check the signs inside the brackets.',
      `Your brackets multiply back to ${m(back)}. The numbers are right but the middle term has the wrong sign, flip the signs in the brackets.`,
    );
  }
  if (fEq(a[0], b[0]) && !fEq(a[1], b[1])) {
    return d(
      'factor-wrong-sum',
      'factoring',
      'gap',
      'Those numbers multiply correctly, but don’t add up.',
      `Your brackets multiply back to ${m(back)}. You need two numbers that multiply to ${m(lit(fDiv(a[0], a[2])))} and add to ${m(lit(fDiv(a[1], a[2])))}.`,
    );
  }
  if (fEq(a[1], b[1]) && !fEq(a[0], b[0])) {
    return d(
      'factor-wrong-product',
      'factoring',
      'gap',
      'Those numbers add correctly, but don’t multiply to the last term.',
      `Your brackets multiply back to ${m(back)}. You need two numbers that add to ${m(lit(fDiv(a[1], a[2])))} and multiply to ${m(lit(fDiv(a[0], a[2])))}.`,
    );
  }
  return null;
}

/* ───────────── the catch-all: one number is off ───────────── */

interface ConstantFix {
  fixed: Statement;
  was: Node;
  shouldBe: Frac;
  inExponent: boolean;
}

function residual(prep: Prepared, prev: Statement, cand: Statement): number | null {
  if (prep.mode === 'expr') {
    if (prev.kind !== 'expr' || cand.kind !== 'expr') return null;
    const vars = [...new Set([...variablesOf(prev.expr), ...variablesOf(cand.expr)])].sort();
    const env: Record<string, number> = {};
    vars.forEach((name, i) => (env[name] = [1.37, 2.11, 0.73, 3.19][i % 4]));
    for (const k of Object.keys(prep.subs)) env[k] = evalNum(prep.subs[k], {});
    const r = evalNum(cand.expr, env) - evalNum(prev.expr, env);
    return Number.isFinite(r) ? r : null;
  }
  if (prep.mode === 'eq' || prep.mode === 'ineq') {
    if (cand.kind !== 'rel' || cand.rels.length !== 1 || prev.kind !== 'rel') return null;
    const asEq: Statement = { kind: 'rel', join: 'or', rels: prev.rels.map((r) => ({ ...r, op: '=' as const })) };
    const P = statementSolutions(asEq, prep.v);
    if (!P || P.kind !== 'finite' || P.roots.length === 0) return null;
    const x = P.roots[0].value;
    const r = evalNum(cand.rels[0].lhs, { [prep.v]: x }) - evalNum(cand.rels[0].rhs, { [prep.v]: x });
    return Number.isFinite(r) ? r : null;
  }
  if (prep.mode === 'system' && prep.system && cand.kind === 'rel') {
    // total mismatch at the true solution of the system
    const env: Record<string, number> = {};
    for (const k of Object.keys(prep.system)) env[k] = fNum(prep.system[k]);
    let total = 0;
    for (const rel of cand.rels) {
      const r = evalNum(rel.lhs, env) - evalNum(rel.rhs, env);
      if (!Number.isFinite(r)) return null;
      total += r;
    }
    return total;
  }
  return null;
}

function constantFix(prep: Prepared, prev: Statement, cur: Statement): ConstantFix | null {
  let best: (ConstantFix & { change: number }) | null = null;
  const g0 = residual(prep, prev, cur);
  if (g0 === null) return null;
  for (const site of numericLiterals(cur)) {
    if (site.node.t !== 'num') continue;
    const v0 = site.node.v;
    // the residual is (nearly always) linear in any one number, so two samples locate its zero
    const g1 = residual(prep, prev, site.replace(num(fAdd(v0, ONE))));
    if (g1 === null) continue;
    const slope = g1 - g0;
    if (Math.abs(slope) < 1e-12) continue;
    const target = fNum(v0) - g0 / slope;
    const snapped = snapToFrac(target, 24, 1e-6);
    if (!snapped || fEq(snapped, v0)) continue;
    if (fIsInt(v0) && !fIsInt(snapped)) continue;
    const fixed = site.replace(lit(snapped));
    if (relate(prep, prev, fixed) !== true) continue;
    const change = Math.abs(fNum(snapped) - fNum(v0)) / Math.max(1, Math.abs(fNum(v0)));
    if (!best || change < best.change) best = { fixed, was: site.node, shouldBe: snapped, inExponent: site.inExponent, change };
  }
  return best;
}

/* ───────────── putting it together ───────────── */

const KIND_CONCEPT: Record<ProblemKind, ConceptId> = {
  linear: 'inverse-operations',
  quadratic: 'zero-product',
  equation: 'inverse-operations',
  inequality: 'inequality-flip',
  simplify: 'like-terms',
  expand: 'distributive',
  factor: 'factoring',
  evaluate: 'order-of-operations',
  system: 'systems',
  derivative: 'power-rule',
  integral: 'antiderivatives',
  definite: 'definite-integrals',
  limit: 'limits',
  open: 'arithmetic',
};

/** Term-by-term fingerprint of a line as written (nothing collected), e.g. L|x:3  L|:6  R|:14. */
function signature(st: Statement): string[] {
  const out: string[] = [];
  const side = (tag: string, n: Node) => {
    for (const t of terms(n)) {
      const r = safeRat(t);
      if (!r || !pIsConst(r.d)) {
        out.push(`${tag}|?${toText(t)}`);
        continue;
      }
      if (r.n.size === 0) out.push(`${tag}|:0`);
      for (const [key, coef] of r.n) out.push(`${tag}|${key}:${coef.n}/${coef.d}`);
    }
  };
  if (st.kind === 'expr') side('E', st.expr);
  if (st.kind === 'rel') st.rels.forEach((r, i) => {
    side(`L${i}`, r.lhs);
    side(`R${i}`, r.rhs);
  });
  return out;
}

function overlap(a: string[], b: string[]): number {
  const pool = b.slice();
  let hit = 0;
  for (const x of a) {
    const i = pool.indexOf(x);
    if (i >= 0) {
      hit++;
      pool.splice(i, 1);
    }
  }
  return hit / Math.max(1, a.length, b.length);
}

export function diagnose(prep: Prepared, prev: Statement, cur: Statement): Diagnosis {
  const matches = (cand: Statement): boolean => {
    try {
      return relate(prep, cand, cur) === true && relate(prep, cand, prev) !== true;
    } catch {
      return false;
    }
  };
  const curSig = signature(cur);
  /**
   * Several wrong moves can land on the same value. Among the ones that
   * reproduce the student's line, prefer the one that also *looks* like it.
   */
  const tryGens = (gens: Generator<Candidate>[]): Draft | null => {
    let best: { diag: () => Draft; score: number } | null = null;
    let budget = 900;
    for (const gen of gens) {
      for (const c of gen) {
        if (budget-- <= 0) break;
        if (!matches(c.st)) continue;
        const score = overlap(signature(c.st), curSig);
        if (!best || score > best.score + 1e-9) best = { diag: c.diag, score };
        if (score >= 0.999) return c.diag();
      }
    }
    return best ? best.diag() : null;
  };
  const tryGen = (gen: Generator<Candidate>): Draft | null => tryGens([gen]);

  const withFix = (draft: Draft, fix?: string): Diagnosis => ({ ...draft, fix });

  // 1. inequality pointing the wrong way
  if (prep.mode === 'ineq' && cur.kind === 'rel') {
    const flipped: Statement = { ...cur, rels: cur.rels.map((r) => ({ ...r, op: FLIP[r.op] })) };
    if (relate(prep, prev, flipped) === true) {
      const negativeAround = statementHas(prev, (n) => containsType(n, 'neg'));
      return withFix(
        d(
          'inequality-flip',
          'inequality-flip',
          'gap',
          negativeAround ? 'Dividing by a negative flips the inequality.' : 'The inequality only flips for a negative.',
          negativeAround
            ? 'When you multiply or divide both sides by a negative number, the inequality sign turns around. Everything else in this line is right.'
            : 'The sign turns around only when you multiply or divide by a negative number. Here that didn’t happen, so it should point the same way as before.',
        ),
        statementToText(flipped),
      );
    }
  }

  // 2. lost / extra / mirrored solutions
  const rootDraft = rootsDiagnosis(prep, prev, cur);
  if (rootDraft) return withFix(rootDraft);

  // 3. factoring that doesn't multiply back
  if (prev.kind === 'expr' && cur.kind === 'expr') {
    const f = factoringDiagnosis(prev.expr, cur.expr);
    if (f) return withFix(f);
  }
  if (prev.kind === 'rel' && cur.kind === 'rel' && prev.rels.length === 1 && cur.rels.length === 1) {
    const pr = prev.rels[0];
    const cr = cur.rels[0];
    const zero = (n: Node) => n.t === 'num' && fIsZero(n.v);
    if (zero(pr.rhs) && zero(cr.rhs)) {
      const f = factoringDiagnosis(pr.lhs, cr.lhs);
      if (f) return withFix(f);
    }
  }

  // 4. structural mal-rules, most specific first
  const rules: NodeRule[] =
    prep.problem.kind === 'evaluate'
      ? [orderRule, exponentRule, distributionRule, fractionRule, combineRule]
      : [distributionRule, exponentRule, combineRule, fractionRule, orderRule];
  {
    const hit = tryGens(rules.map((rule) => fromNodeRule(prev, rule)));
    if (hit) return withFix(hit);
  }

  // 5. equation moves
  if (prep.mode === 'eq' || prep.mode === 'ineq') {
    const hit =
      tryGen(coefficientCandidates(prev)) ??
      tryGen(signFlipCandidates(prev, cur)) ??
      tryGen(clearingCandidates(prev)) ??
      tryGen(partialDivisionCandidates(prev));
    if (hit) return withFix(hit);
  } else {
    const hit = tryGen(signFlipCandidates(prev, cur));
    if (hit) return withFix(hit);
  }

  // 6. a single number is off
  const fix = constantFix(prep, prev, cur);
  if (fix) {
    const fixedText = statementToText(fix.fixed);
    if (fix.inExponent) {
      return withFix(
        d(
          'exponent-slip',
          'exponent-rules',
          'gap',
          'Check that power.',
          `The power ${m(fix.was)} should be ${m(lit(fix.shouldBe))}. Count how the exponents combine in the line above.`,
        ),
        fixedText,
      );
    }
    const involvesNegatives = statementHas(prev, (n) => containsType(n, 'neg'));
    return withFix(
      d(
        'arithmetic-slip',
        involvesNegatives ? 'signed-arithmetic' : 'arithmetic',
        'slip',
        'One number slipped.',
        `You wrote ${m(fix.was)} where it should be ${m(lit(fix.shouldBe))}. The method is fine, it’s just the calculation.`,
      ),
      fixedText,
    );
  }

  // 7. nothing recognisable
  return withFix(
    d(
      'unknown',
      prep.problem.concepts[0] ?? KIND_CONCEPT[prep.problem.kind],
      'gap',
      'This line doesn’t follow from the one above.',
      'I can’t find a valid step that turns the line above into this one. Change one thing at a time and write each change on its own line, so we can both see where it goes.',
    ),
  );
}

export { hasProductOfSums, pPrimitive, pConstValue };
