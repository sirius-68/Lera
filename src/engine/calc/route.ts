import { SolutionStep } from '../types';
import { E, N, V, add, diff, div, ev, fn, has, isVar, mul, neg, nice, numText, pow, signOf, simp, subst, toLatex, toText } from './expr';
import { insides, inTermsOf, integrate, outer, polyToExpr, toPoly } from './integrate';
import { t } from '../../i18n';

/**
 * A worked route in the smallest steps a good teacher writes on the board.
 *
 * The route is built by rewriting the whole problem one rule at a time. Every line is the whole problem with one
 * more small move made, so every line is still true and can be checked like a learner's line. A ∫ or d/dx that has
 * not been worked out yet simply stays in the line until its turn comes.
 *
 * Lines marked `aside` are working on the side (u = …, du = …, a value put in): they are not the whole problem.
 */

type Int = Extract<E, { t: 'int' }>;
type Der = Extract<E, { t: 'd' }>;

const I = (a: E, v: string): E => ({ t: 'int', a, v });
const D = (a: E, v: string): E => ({ t: 'd', a, v });
const show = (e: E): string => toText(look(e));

/** An expression written the way it is written by hand. */
export const handText = show;
const same = (a: E, b: E): boolean => show(a) === show(b);

/** Drawn the way it is written by hand: 3 · x³/3 as one fraction, 3x³/3. Only the look changes, never the value. */
function look(e: E): E {
  switch (e.t) {
    case '+':
      return { t: '+', a: e.a.map(look) };
    case '*': {
      // 4 · (−3x⁻⁴) is one product, 4(−3)x⁻⁴: a nested product starting with a minus would read as a subtraction
      const a = e.a.map(look).flatMap((x) => (x.t === '*' ? x.a : [x]));
      // (−sin 4x) · 4 reads better as −(sin 4x · 4)
      const negs = a.filter((x) => x.t === 'neg');
      if (negs.length === 1 && a.length > 1) return neg(look(mul(...a.map((x) => (x.t === 'neg' ? x.a : x)))));
      // every fraction in a product drawn as one: ½ · e²ˣ/2 is e²ˣ/(2 · 2), never two fractions side by side
      const fr = a.filter((x): x is Extract<E, { t: '/' }> => x.t === '/');
      if (fr.length >= 1 && a.length > 1 && a.every((x) => x.t !== 'int' && x.t !== 'd')) {
        const rest = a.filter((x) => x.t !== '/');
        const tops = fr.map((f) => f.n).filter((n) => !(n.t === 'n' && n.v === 1));
        const top = rest.length + tops.length ? mul(...rest, ...tops) : N(1);
        return div(top, mul(...fr.map((f) => f.d)));
      }
      return { t: '*', a };
    }
    case '/':
      return div(look(e.n), look(e.d));
    case '^':
      return pow(look(e.b), look(e.e));
    case 'neg': {
      const a = look(e.a);
      return a.t === 'neg' ? a.a : neg(a);
    }
    case 'f':
      return fn(e.name, look(e.a));
    case 'int':
      return { ...e, a: look(e.a) };
    case 'd':
      return { ...e, a: look(e.a) };
    default:
      return e;
  }
}

/** Work out the plain arithmetic (2 + 1 → 3, 3 · 2 → 6) and nothing else, so the next line shows only that. */
function numbers(e: E): E {
  const plain = (x: E): boolean => {
    switch (x.t) {
      case 'n':
        return true;
      case '+':
      case '*':
        return x.a.every(plain);
      case 'neg':
        return plain(x.a);
      case '^':
        return plain(x.b) && plain(x.e);
      default:
        return false;
    }
  };
  if (e.t !== 'n' && plain(e)) {
    const val = nice(ev(e, {}));
    if (Number.isFinite(val) && Number.isInteger(val)) return N(val);
  }
  switch (e.t) {
    case '+':
      return { t: '+', a: e.a.map(numbers) };
    case '*':
      return { t: '*', a: e.a.map(numbers) };
    case '/': {
      const n = numbers(e.n);
      const d = numbers(e.d);
      return d.t === 'n' && d.v === 1 ? n : div(n, d);
    }
    case '^': {
      const b = numbers(e.b);
      const x = numbers(e.e);
      return x.t === 'n' && x.v === 1 ? b : pow(b, x);
    }
    case 'neg':
      return neg(numbers(e.a));
    case 'f':
      return fn(e.name, numbers(e.a));
    case 'int':
    case 'd':
      return { ...e, a: numbers(e.a) };
    default:
      return e;
  }
}

/** Replace one node (by identity) inside an expression. Untouched parts keep their identity, so several swaps can follow each other. */
function swap(e: E, target: E, by: E): E {
  if (e === target) return by;
  const r = (x: E): E => swap(x, target, by);
  switch (e.t) {
    case '+':
    case '*': {
      const a = e.a.map(r);
      return a.every((x, i) => x === e.a[i]) ? e : { t: e.t, a };
    }
    case '/': {
      const n = r(e.n);
      const d = r(e.d);
      return n === e.n && d === e.d ? e : div(n, d);
    }
    case '^': {
      const b = r(e.b);
      const x = r(e.e);
      return b === e.b && x === e.e ? e : pow(b, x);
    }
    case 'neg':
    case 'f': {
      const a = r(e.a);
      return a === e.a ? e : { ...e, a };
    }
    case 'int':
    case 'd': {
      const a = r(e.a);
      return a === e.a ? e : { ...e, a };
    }
    default:
      return e;
  }
}

/** A term of a sum with its minus sign kept outside: −2x becomes −∫ 2x dx, not ∫ (−2x) dx. */
const signed = (term: E, wrap: (body: E) => E): E => {
  const [minus, body] = signOf(term);
  return minus ? neg(wrap(body)) : wrap(term);
};

/** A product with every factor at the top level: 2x · eˣ is 2 · x · eˣ. */
const flat = (...fs: E[]): E => mul(...fs.flatMap((f) => (f.t === '*' ? f.a : [f])).filter((f) => !(f.t === 'n' && f.v === 1)));

/** Every ∫ (or d/dx) still waiting in a line, outermost first. */
function waiting<T extends 'int' | 'd'>(e: E, kind: T, out: Extract<E, { t: T }>[] = []): Extract<E, { t: T }>[] {
  if (e.t === kind) {
    out.push(e as Extract<E, { t: T }>);
    return out;
  }
  switch (e.t) {
    case '+':
    case '*':
      e.a.forEach((x) => waiting(x, kind, out));
      break;
    case '/':
      waiting(e.n, kind, out);
      waiting(e.d, kind, out);
      break;
    case '^':
      waiting(e.b, kind, out);
      waiting(e.e, kind, out);
      break;
    case 'neg':
    case 'f':
      waiting(e.a, kind, out);
      break;
    default:
  }
  return out;
}

/* ───────────── shapes a power rule can take ───────────── */

/** x, xⁿ, 1/xⁿ, √x, 1/√x: the power n, or null. */
function powerOf(f: E, v: string): number | null {
  if (isVar(f, v)) return 1;
  if (f.t === '^' && isVar(f.b, v) && f.e.t === 'n') return f.e.v;
  if (f.t === '^' && isVar(f.b, v) && f.e.t === '/' && f.e.n.t === 'n' && f.e.d.t === 'n') return f.e.n.v / f.e.d.v;
  if (f.t === 'f' && f.name === 'sqrt' && isVar(f.a, v)) return 0.5;
  return null;
}

/** 1/xⁿ or √x written as a power, when that is what the power rule needs. */
function asPower(f: E, v: string): { e: E; n: number } | null {
  if (f.t === 'f' && f.name === 'sqrt' && isVar(f.a, v)) return { e: pow(V(v), div(N(1), N(2))), n: 0.5 };
  if (f.t === '/' && f.n.t === 'n' && f.n.v === 1) {
    const d = f.d;
    if (isVar(d, v)) return null; // 1/x is ln|x|, not a power
    const m = d.t === 'f' && d.name === 'sqrt' && isVar(d.a, v) ? 0.5 : powerOf(d, v);
    if (m !== null && m !== 0) return { e: pow(V(v), m === 0.5 ? neg(div(N(1), N(2))) : N(-m)), n: -m };
  }
  return null;
}

const nText = (n: number): string => numText(n);

/** A power in the form a learner would write it while applying a rule: x^(2 + 1). */
const raised = (v: string, n: number, by: number): E => pow(V(v), add(N(n), N(by)));

/* ───────────── integrals ───────────── */

type IRule = 'sum' | 'out' | 'rewrite' | 'expand' | 'split' | 'number' | 'power' | 'log' | 'table' | 'linear' | 'usub' | 'parts' | 'whole';
const I_ORDER: IRule[] = ['sum', 'out', 'rewrite', 'expand', 'split', 'number', 'power', 'log', 'table', 'linear', 'usub', 'parts', 'whole'];

interface IMove {
  rule: IRule;
  by: E;
  /** Named values for the explanation. */
  n?: number;
  /** Working on the side that comes before this move (u = …, du = …). */
  aside?: SolutionStep[];
  /** The rule as a formula, for the explanation. */
  formula?: string;
  why?: string;
}

const consts = (f: E, v: string): { k: E[]; rest: E[] } | null => {
  if (f.t !== '*') return null;
  const k = f.a.filter((x) => !has(x, v));
  const rest = f.a.filter((x) => has(x, v));
  return k.length && rest.length ? { k, rest } : null;
};

/** The one small move that works out the next bit of ∫ f dv. */
function intMove(node: Int, uName: string): IMove | null {
  const { a: f, v } = node;
  if (!has(f, v)) return { rule: 'number', by: f.t === 'n' && f.v === 1 ? V(v) : mul(f, V(v)) };
  if (f.t === '+') return { rule: 'sum', by: add(...f.a.map((x) => signed(x, (b) => I(b, v)))) };
  if (f.t === 'neg') return { rule: 'out', by: neg(I(f.a, v)) };
  const c = consts(f, v);
  // 2x cos(x²): the 2 is part of du, so it stays where it is
  const viaU = c ? integrate(f, v) : null;
  if (c && !(viaU && viaU.how === 'usub' && substitution(f, v)?.g && isWholeNumber(substitution(f, v)?.g))) return { rule: 'out', by: mul(...c.k, I(mul(...c.rest), v)) };
  if (f.t === '/' && !has(f.d, v)) return { rule: 'out', by: mul(div(N(1), f.d), I(f.n, v)) };
  if (f.t === '/' && !has(f.n, v) && !(f.n.t === 'n' && f.n.v === 1)) return { rule: 'out', by: mul(f.n, I(div(N(1), f.d), v)) };
  if (f.t === '/' && f.n.t === '*') {
    const cn = consts(f.n, v);
    if (cn) return { rule: 'out', by: mul(...cn.k, I(div(mul(...cn.rest), f.d), v)) };
  }
  if (f.t === '/' && f.d.t === '*') {
    const cd = consts(f.d, v);
    if (cd) return { rule: 'out', by: mul(div(N(1), mul(...cd.k)), I(div(f.n, mul(...cd.rest)), v)) };
  }

  const n = powerOf(f, v);
  if (n !== null) {
    if (n === -1) return { rule: 'log', by: fn('ln', fn('abs', V(v))) };
    return { rule: 'power', n, by: n === Math.round(n) ? div(raised(v, n, 1), add(N(n), N(1))) : div(pow(V(v), N(n + 1)), N(n + 1)) };
  }
  if (f.t === '/' && f.n.t === 'n' && f.n.v === 1 && isVar(f.d, v)) return { rule: 'log', by: fn('ln', fn('abs', V(v))) };
  const p = asPower(f, v);
  if (p) return { rule: 'rewrite', by: I(p.e, v), n: p.n };

  const whole = integrate(f, v);
  if (!whole) return null;

  // a polynomial still in brackets: multiply it out first, unless a substitution keeps it folded
  const poly = toPoly(f, v);
  if (poly && whole.how === 'power') {
    const flat = polyToExpr(poly, v);
    if (!same(flat, f)) return { rule: 'expand', by: I(flat, v) };
  }
  // (x² + 1)/x: each term on top over the bottom
  if (f.t === '/' && simp(f.n).t === '+' && f.d.t !== '+' && (whole.how === 'power' || whole.how === 'table')) {
    const top = simp(f.n) as Extract<E, { t: '+' }>;
    return { rule: 'split', by: I(add(...top.a.map((x) => simp(div(x, f.d)))), v) };
  }
  // straight from the table
  const direct = outer(f, v);
  if (direct) return { rule: 'table', by: direct };

  if (whole.how === 'linear' || whole.how === 'usub') {
    const sub = substitution(f, v);
    if (sub && sub.linear) {
      const a = simp(diff(sub.u, v));
      return { rule: 'linear', by: whole.F, why: t('The inside, ${0}$, is a straight line. Integrate the outside as if ${1}$ were a plain {2}, then divide by ${3}$, the number in front of {4}: differentiating would bring that number out, so dividing cancels it.', { 0: toText(sub.u), 1: toText(sub.u), 2: v, 3: toText(a), 4: v }) };
    }
    if (sub) {
      const du = simp(diff(sub.u, v));
      const inU = subst(sub.g, '§', V(uName));
      const steps: SolutionStep[] = [
        { tag: 'calc', aside: true, line: `${uName} = ${toText(sub.u)}`, why: t('Look for a function inside another whose derivative is also in the problem. The inside here is ${0}$, and its derivative ${1}$ is sitting in the problem, so let {2} = ${3}$.', { 0: toText(sub.u), 1: toText(du), 2: uName, 3: toText(sub.u) }) },
        { tag: 'calc', aside: true, line: `d${uName} = ${toText(look(du))} d${v}`, why: t('Differentiate {0}: d{1}/d{2} = ${3}$, so d{4} = ${5}$ d{6}.', { 0: uName, 1: uName, 2: v, 3: toText(du), 4: uName, 5: toText(du), 6: v }) },
        {
          tag: 'calc',
          aside: true,
          line: show(I(inU, uName)),
          why:
            t('Swap: ${0}$ becomes {1}, and ${2}$ d{3} becomes d{4}. Now the whole integral is in {5} and is one you know.', { 0: toText(sub.u), 1: uName, 2: toText(du), 3: v, 4: uName, 5: uName }) +
            (isWholeNumber(sub.g) ? '' : ` ${t('The number ${0}$ in front makes up for the difference between what is in the problem and d{1}.', { 0: numText(numberIn(sub.g)), 1: uName })}`),
        },
      ];
      const inner = intRoute(I(inU, uName), uName, false);
      if (!inner) return null;
      for (const s of inner.steps) steps.push({ ...s, aside: true });
      const back = subst(inner.result, uName, sub.u);
      return { rule: 'usub', by: back, aside: steps, why: t('Put ${0}$ back in place of {1}.', { 0: toText(sub.u), 1: uName }) };
    }
  }
  if (whole.how === 'parts' && whole.u && whole.dv) {
    const u = whole.u;
    const dv = whole.dv;
    const V_ = integrate(dv, v);
    if (V_) {
      const du = simp(diff(u, v));
      const vv = V_.F;
      const steps: SolutionStep[] = [
        { tag: 'calc', aside: true, line: `u = ${toText(u)}`, why: t('Two different kinds of function multiplied: use **integration by parts**. Choose u to be the part that gets simpler when you differentiate it: u = ${0}$.', { 0: toText(u) }) },
        { tag: 'calc', aside: true, line: `dv = ${toText(look(dv))} d${v}`, why: t('Everything else is dv.') },
        { tag: 'calc', aside: true, line: `du = ${isNum1(du) ? '' : toText(look(du)) + ' '}d${v}`, why: t('Differentiate u to get du.') },
        { tag: 'calc', aside: true, line: `v = ${show(vv)}`, why: t('Integrate dv to get v. No + C here: one constant at the very end is enough.') },
      ];
      const [minus, vb] = signOf(vv);
      const by = minus ? add(neg(mul(u, vb)), I(flat(du, vb), v)) : add(mul(u, vv), neg(I(flat(du, vv), v)));
      return { rule: 'parts', by, aside: steps, formula: '\\int u\\,dv = uv - \\int v\\,du', why: t('Put u, v and du into the formula. What is left is a simpler integral.') };
    }
  }
  return { rule: 'whole', by: whole.F };
}

const isNum1 = (e: E): boolean => e.t === 'n' && e.v === 1;

/** g(u) with no number in front other than 1: the substitution uses the whole of du as it stands. */
const isWholeNumber = (g: E | undefined): boolean => !!g && Math.abs(numberIn(g) - 1) < 1e-9;

/** The plain number multiplying an expression: 3 for 3·2⁻¹·…, 1 when there is none. */
const numberIn = (g: E): number => (g.t === '*' ? g.a : [g]).reduce((k, x) => (x.t === 'n' ? k * x.v : k), 1);

/** The inside u of a substitution, with the integrand rewritten in § = u. */
function substitution(f: E, v: string): { u: E; g: E; linear: boolean } | null {
  const seen = new Set<string>();
  for (const u of insides(f, v)) {
    const key = JSON.stringify(u);
    if (seen.has(key)) continue;
    seen.add(key);
    const g = inTermsOf(f, u, v);
    if (!g) continue;
    if (!integrate(subst(g, '§', V('§')), '§')) continue;
    return { u, g, linear: !has(simp(diff(u, v)), v) };
  }
  return null;
}

/** The explanation for one round of moves of the same kind. */
function intWhy(rule: IRule, moves: { node: Int; m: IMove }[], v: string): { why: string; rule?: string } {
  const ns = [...new Set(moves.map((x) => x.m.n).filter((n): n is number => n !== undefined))].map(nText);
  switch (rule) {
    case 'sum':
      return { why: t('Integrate a sum one term at a time: split it into one integral for each term.'), rule: `\\int (f + g)\\,d${v} = \\int f\\,d${v} + \\int g\\,d${v}` };
    case 'out':
      return { why: t('A number multiplying the function can wait outside the integral. Take it out, and integrate only what is left.'), rule: `\\int k\\,f(${v})\\,d${v} = k \\int f(${v})\\,d${v}` };
    case 'rewrite':
      return { why: t('Write it as a power of {0}, so the power rule can be used. Here the power is {1}.', { 0: v, 1: ns.join(', ') }) };
    case 'expand':
      return { why: t('Multiply out the brackets first, so that every term is a plain power of {0}.', { 0: v }) };
    case 'split':
      return { why: t('Split the fraction: divide each term on top by the bottom. Now each piece is one you know.') };
    case 'number':
      return { why: t('The integral of a plain number k is k{0}: differentiate k{1} and you get k back.', { 0: v, 1: v }), rule: `\\int k\\,d${v} = k${v} + C` };
    case 'power':
      return {
        why: ns.length === 1 ? t('**Power rule**: add 1 to the power, then divide by the new power. Here n = {0}, so the new power is {0} + 1.', { 0: ns[0] }) : t('**Power rule** for each term: add 1 to the power, then divide by the new power. Here {0}.', { 0: ns.map((n) => `n = ${n}`).join(', ') }),
        rule: `\\int ${v}^{n}\\,d${v} = \\frac{${v}^{n+1}}{n+1} + C \\quad (n \\neq -1)`,
      };
    case 'log':
      return { why: t('The power rule cannot divide by 0, so 1/{0} is the exception. Its integral is the natural log of the size of {1}, shown in the rule, because that has derivative 1/{2}.', { 0: v, 1: v, 2: v }), rule: `\\int \\frac{1}{${v}}\\,d${v} = \\ln|${v}| + C` };
    case 'table': {
      const one = moves[0];
      const entry = moves.map(({ node, m }) => `\\int ${toLatex(node.a)}\\,d${v} = ${toLatex(look(m.by))} + C`)[0];
      return { why: one && moves.length === 1 ? t('This one is in the table of standard integrals: run the table of derivatives backwards.') : t('These are in the table of standard integrals: run the table of derivatives backwards.'), rule: entry };
    }
    case 'linear':
      return { why: moves[0].m.why ?? '' };
    case 'usub':
      return { why: moves[0].m.why ?? '' };
    case 'parts':
      return { why: moves[0].m.why ?? '', rule: moves[0].m.formula };
    case 'whole':
      return { why: t('Find a function whose derivative is what is inside the integral.') };
  }
}

interface Route {
  steps: SolutionStep[];
  result: E;
}

/** The route for ∫ f dv: one round per kind of rule, every line the whole integral so far. */
function intRoute(start: E, v: string, withC: boolean): Route | null {
  const uName = v === 'u' ? 'w' : 'u';
  let e = start;
  const steps: SolutionStep[] = [];
  for (let round = 0; round < 24; round++) {
    const nodes = waiting(e, 'int');
    if (!nodes.length) break;
    const moves: { node: Int; m: IMove }[] = [];
    for (const node of nodes) {
      const m = intMove(node, uName);
      if (!m) return null;
      moves.push({ node, m });
    }
    const first = I_ORDER.find((r) => moves.some((x) => x.m.rule === r)) as IRule;
    // a substitution or by-parts is shown one integral at a time; the simple rules all at once
    const now = moves.filter((x) => x.m.rule === first).slice(0, first === 'usub' || first === 'parts' || first === 'whole' ? 1 : undefined);
    for (const { m } of now) if (m.aside) steps.push(...m.aside);
    let next = e;
    for (const { node, m } of now) next = swap(next, node, m.by);
    const w = intWhy(first, now, v);
    steps.push({ tag: 'calc', line: show(next), why: w.why, rule: w.rule });
    e = next;
    const counted = numbers(e);
    if (!same(counted, e)) {
      steps.push({ tag: 'calc', line: show(counted), why: t('Work out the numbers.') });
      e = counted;
    }
  }
  if (waiting(e, 'int').length) return null;
  const tidy = simp(e);
  if (!same(tidy, e)) {
    steps.push({ tag: 'calc', line: show(tidy), why: t('Tidy up: multiply the numbers together and cancel what cancels.') });
    e = tidy;
  }
  if (withC) steps.push({ tag: 'final', line: `${show(e)} + C`, why: t('Finish with **+ C**. Any constant disappears when you differentiate, so every antiderivative is this one plus some constant, and one C covers them all.') });
  return { steps, result: e };
}

/** The route for an indefinite integral: the antiderivative in small steps, then + C. */
export function integralRoute(body: E, v: string): SolutionStep[] | null {
  const r = intRoute(I(body, v), v, true);
  return r && r.steps.length >= 2 ? r.steps : null;
}

/** The route for a definite integral: the antiderivative, its value at the top, at the bottom, then top minus bottom. */
export function definiteRoute(body: E, v: string, lo: number, hi: number, value: number): SolutionStep[] | null {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const r = intRoute(I(body, v), v, false);
  if (!r) return null;
  const F = r.result;
  const at = (x: number): number => nice(ev(F, { [v]: x }));
  const top = at(hi);
  const bottom = at(lo);
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  const steps: SolutionStep[] = r.steps.map((s, i) => (i === 0 ? { ...s, why: `${t('First find the antiderivative and leave the limits for the end.')} ${s.why}` } : s));
  const filled = (x: number): string => show(subst(F, v, x < 0 ? neg(N(-x)) : N(x)));
  steps.push({ tag: 'calc', aside: true, line: `${filled(hi)} = ${numText(top)}`, why: t('Put the top limit, {0} = {1}, into the antiderivative.', { 0: v, 1: numText(hi) }) });
  steps.push({ tag: 'calc', aside: true, line: `${filled(lo)} = ${numText(bottom)}`, why: t('Put the bottom limit, {0} = {1}, into the antiderivative.', { 0: v, 1: numText(lo) }) });
  steps.push({ tag: 'calc', line: `${numText(top)} - ${bottom < 0 ? `(${numText(bottom)})` : numText(bottom)}`, why: t('**Top minus bottom**, never the other way round. (No + C is needed: it would cancel here.)'), rule: `\\int_a^b f(${v})\\,d${v} = F(b) - F(a)` });
  steps.push({ tag: 'final', line: numText(value), why: t('Do the subtraction. A definite integral comes to one number.') });
  return steps;
}

/* ───────────── derivatives ───────────── */

type DRule = 'sum' | 'out' | 'rewrite' | 'number' | 'line' | 'power' | 'table' | 'product' | 'quotient' | 'chain' | 'whole';
const D_ORDER: DRule[] = ['sum', 'out', 'rewrite', 'number', 'line', 'power', 'table', 'product', 'quotient', 'chain', 'whole'];

interface DMove {
  rule: DRule;
  by: E;
  n?: number;
  why?: string;
  formula?: string;
}

const TABLE_D: Record<string, string> = {
  sin: 'cos(x)',
  cos: '-sin(x)',
  tan: 'sec(x)^2',
  ln: '1/x',
  sec: 'sec(x) tan(x)',
  csc: '-csc(x) cot(x)',
  cot: '-csc(x)^2',
  asin: '1/sqrt(1 - x^2)',
  atan: '1/(1 + x^2)',
  sinh: 'cosh(x)',
  cosh: 'sinh(x)',
};

function derMove(node: Der, top: boolean): DMove | null {
  const { a: f, v } = node;
  if (!has(f, v)) return { rule: 'number', by: N(0) };
  // the inside of a chain, a straight line: its derivative is the number in front of x
  const lin = toPoly(f, v);
  if (!top && lin && lin.length === 2 && !isVar(f, v)) return { rule: 'line', by: N(lin[1]) };
  if (f.t === '+') return { rule: 'sum', by: add(...f.a.map((x) => signed(x, (b) => D(b, v)))) };
  if (f.t === 'neg') return { rule: 'out', by: neg(D(f.a, v)) };
  const c = consts(f, v);
  if (c) return { rule: 'out', by: mul(...c.k, D(mul(...c.rest), v)) };
  if (f.t === '/' && !has(f.d, v)) return { rule: 'out', by: mul(div(N(1), f.d), D(f.n, v)) };
  if (f.t === '/' && !has(f.n, v) && !(f.n.t === 'n' && f.n.v === 1)) return { rule: 'out', by: mul(f.n, D(div(N(1), f.d), v)) };

  const n = powerOf(f, v);
  if (n !== null) {
    const by = n === 1 ? N(1) : n === Math.round(n) ? mul(N(n), raised(v, n, -1)) : mul(N(n), pow(V(v), N(n - 1)));
    return { rule: 'power', n, by };
  }
  const p = asPower(f, v);
  if (p) return { rule: 'rewrite', by: D(p.e, v), n: p.n };
  // a plain function of x from the table
  if (f.t === 'f' && isVar(f.a, v) && f.name !== 'abs' && f.name !== 'sqrt') {
    const d = simp(diff(f, v));
    return { rule: 'table', by: d };
  }
  if (f.t === '^' && !has(f.b, v) && isVar(f.e, v)) return { rule: 'table', by: simp(diff(f, v)) };

  if (f.t === '*') {
    const parts = f.a.filter((x) => has(x, v));
    if (parts.length >= 2) {
      const u = parts[0];
      const w = mul(...parts.slice(1));
      return { rule: 'product', by: add(mul(D(u, v), w), mul(u, D(w, v))), why: t('Two functions multiplied: **product rule**. Here u = ${0}$ and v = ${1}$. Each takes a turn being differentiated while the other waits.', { 0: toText(u), 1: toText(w) }), formula: "(uv)' = u'v + uv'" };
    }
  }
  if (f.t === '/' && has(f.n, v) && has(f.d, v)) {
    return { rule: 'quotient', by: div(add(mul(D(f.n, v), f.d), neg(mul(f.n, D(f.d, v)))), pow(f.d, N(2))), why: t('One function divided by another: **quotient rule**. The top is ${0}$ and the bottom is ${1}$. Always start with the derivative of the top.', { 0: toText(f.n), 1: toText(f.d) }), formula: "\\left(\\frac{u}{v}\\right)' = \\frac{u'v - uv'}{v^2}" };
  }
  if (f.t === '/' && f.n.t === 'n' && f.n.v === 1 && has(f.d, v)) return { rule: 'rewrite', by: D(pow(f.d, N(-1)), v), n: -1 };

  // a function of a function: the chain rule, with the inside held as one block
  let inner: E | null = null;
  if (f.t === 'f') inner = f.a;
  else if (f.t === '^') inner = has(f.b, v) && !isVar(f.b, v) ? f.b : has(f.e, v) && !isVar(f.e, v) ? f.e : null;
  if (inner && !isVar(inner, v)) {
    const block = '§';
    const asBlock = swap(f, inner, V(block));
    const outer = subst(simp(diff(asBlock, block)), block, inner);
    return { rule: 'chain', by: mul(outer, D(inner, v)), why: t('A function inside a function: **chain rule**. Treat ${0}$ as one block. Differentiate the outside and leave the block alone, then multiply by the derivative of the block.', { 0: toText(inner) }), formula: `\\big(f(g(${v}))\\big)' = f'(g(${v}))\\,g'(${v})` };
  }
  return { rule: 'whole', by: simp(diff(f, v)) };
}

function derWhy(rule: DRule, moves: { node: Der; m: DMove }[], v: string): { why: string; rule?: string } {
  const ns = [...new Set(moves.map((x) => x.m.n).filter((n): n is number => n !== undefined))].map(nText);
  switch (rule) {
    case 'sum':
      return { why: t('Differentiate a sum one term at a time.'), rule: "(f + g)' = f' + g'" };
    case 'out':
      return { why: t('A number multiplying the function just waits in front. Take it out and differentiate what is left.'), rule: "(k\\,f)' = k\\,f'" };
    case 'rewrite':
      return { why: t('Write it as a power, so the power rule can be used. Here the power is {0}.', { 0: ns.join(', ') }) };
    case 'number':
      return { why: t('A plain number never changes, so its derivative is 0.') };
    case 'line':
      return { why: t('The inside is a straight line. Its derivative is just the number in front of {0}.', { 0: v }) };
    case 'power':
      return {
        why: ns.length === 1 ? t('**Power rule**: bring the power down in front, then make the power one smaller. Here n = {0}.', { 0: ns[0] }) : t('**Power rule** for each term: bring the power down in front, then make the power one smaller. Here {0}.', { 0: ns.map((n) => `n = ${n}`).join(', ') }),
        rule: `\\frac{d}{d${v}}\\,${v}^{n} = n\\,${v}^{n-1}`,
      };
    case 'table': {
      const entry = moves.map(({ node, m }) => `\\frac{d}{d${v}}\\left[${toLatex(node.a)}\\right] = ${toLatex(look(m.by))}`)[0];
      return { why: moves.length === 1 ? t('This one is in the table of standard derivatives.') : t('These are in the table of standard derivatives.'), rule: entry };
    }
    case 'product':
    case 'quotient':
    case 'chain':
      return { why: moves[0].m.why ?? '', rule: moves[0].m.formula };
    case 'whole':
      return { why: t('Differentiate what is left.') };
  }
}

/** The route for a derivative: one round per kind of rule, every line equal to the derivative. */
export function derivativeRoute(body: E, v: string): SolutionStep[] | null {
  let e: E = D(body, v);
  const steps: SolutionStep[] = [];
  for (let round = 0; round < 24; round++) {
    const nodes = waiting(e, 'd');
    if (!nodes.length) break;
    const moves: { node: Der; m: DMove }[] = [];
    for (const node of nodes) {
      const m = derMove(node, round === 0);
      if (!m) return null;
      moves.push({ node, m });
    }
    const first = D_ORDER.find((r) => moves.some((x) => x.m.rule === r)) as DRule;
    const now = moves.filter((x) => x.m.rule === first).slice(0, first === 'product' || first === 'quotient' || first === 'chain' ? 1 : undefined);
    let next = e;
    for (const { node, m } of now) next = swap(next, node, m.by);
    const w = derWhy(first, now, v);
    steps.push({ tag: 'calc', line: show(next), why: w.why, rule: w.rule });
    e = next;
    const counted = numbers(e);
    if (!same(counted, e)) {
      steps.push({ tag: 'calc', line: show(counted), why: t('Work out the numbers.') });
      e = counted;
    }
  }
  if (waiting(e, 'd').length) return null;
  const tidy = simp(e);
  if (!same(tidy, e)) {
    steps.push({ tag: 'calc', line: show(tidy), why: t('Tidy up: multiply out, collect like terms and cancel what cancels.') });
    e = tidy;
  }
  if (!steps.length) return null;
  steps[steps.length - 1] = { ...steps[steps.length - 1], tag: 'final' };
  return steps.length >= 2 ? steps : null;
}

/* ───────────── limits ───────────── */

/** The route for a limit: try the number, say what breaks, mend it, substitute. */
export function limitRoute(body: E, v: string, to: number, L: number): SolutionStep[] | null {
  const answer = numText(L);
  const at = (e: E): string => show(subst(e, v, to < 0 ? neg(N(-to)) : N(to)));
  if (!Number.isFinite(to)) {
    if (body.t !== '/') return null;
    const n = toPoly(body.n, v);
    const d = toPoly(body.d, v);
    if (!n || !d) return null;
    const lead = (c: number[]): E => {
      const k = c.length - 1;
      const p = k === 1 ? V(v) : pow(V(v), N(k));
      return k === 0 ? N(c[0]) : c[k] === 1 ? p : c[k] === -1 ? neg(p) : mul(N(c[k]), p);
    };
    const trim = (c: number[]): number[] => {
      const out = [...c];
      while (out.length > 1 && Math.abs(out[out.length - 1]) < 1e-12) out.pop();
      return out;
    };
    const nn = trim(n);
    const dd = trim(d);
    const ratioLine = div(lead(nn), lead(dd));
    const dir = to > 0 ? '∞' : '-∞';
    return [
      { tag: 'calc', line: `lim ${v}→${dir} (${show(ratioLine)})`, why: t('When {0} is enormous, only the **highest power** on the top and on the bottom matters; everything else is small change. Keep just those two terms.', { 0: v }) },
      { tag: 'final', line: answer, why: nn.length === dd.length ? t('The powers are the same, so they cancel: divide the two numbers in front.') : nn.length < dd.length ? t('The bigger power is underneath, so the fraction shrinks to 0.') : t('The bigger power is on top, so the fraction grows without end.') },
    ];
  }
  let plug = NaN;
  try {
    plug = ev(body, { [v]: to });
  } catch {
    plug = NaN;
  }
  if (Number.isFinite(plug) && Number.isFinite(L) && Math.abs(plug - L) < 1e-6 * Math.max(1, Math.abs(L))) {
    return [
      { tag: 'calc', line: at(body), why: t('Try putting {0} = {1} straight in. Nothing breaks (no dividing by zero), so that is the answer.', { 0: v, 1: numText(to) }) },
      { tag: 'final', line: answer, why: t('Work out the numbers.') },
    ];
  }
  if (body.t !== '/') return null;
  let zz = false;
  try {
    zz = Math.abs(ev(body.n, { [v]: to })) < 1e-9 && Math.abs(ev(body.d, { [v]: to })) < 1e-9;
  } catch {
    zz = false;
  }
  if (!zz) return null;
  const tryIt: SolutionStep = { tag: 'calc', aside: true, line: `${at(body)} = 0/0`, why: t('Try putting {0} = {1} straight in. Top and bottom both come to 0. That is not an answer: it is a sign that something can be cancelled.', { 0: v, 1: numText(to) }) };
  const n = toPoly(body.n, v);
  const d = toPoly(body.d, v);
  if (n && d) {
    const deflate = (c: number[]): number[] | null => {
      const hi = [...c].reverse();
      const out: number[] = [];
      let carry = 0;
      for (const coef of hi) {
        carry = coef + carry * to;
        out.push(carry);
      }
      return Math.abs(out.pop() as number) < 1e-9 ? out.reverse() : null;
    };
    const qn = deflate(n);
    const qd = deflate(d);
    if (qn && qd && qd.length) {
      const factor = simp(add(V(v), N(-to)));
      const top = polyToExpr(qn, v);
      const bottom = polyToExpr(qd, v);
      const one = (e: E): boolean => e.t === 'n' && e.v === 1;
      const factored = div(one(top) ? factor : mul(factor, top), one(bottom) ? factor : mul(factor, bottom));
      const reduced = one(bottom) ? top : div(top, bottom);
      let left = NaN;
      try {
        left = ev(reduced, { [v]: to });
      } catch {
        left = NaN;
      }
      if (Number.isFinite(left) && Number.isFinite(L) && Math.abs(left - L) < 1e-6 * Math.max(1, Math.abs(L))) {
        return [
          tryIt,
          { tag: 'calc', line: `lim ${v}→${numText(to)} (${show(factored)})`, why: t('Factor the top and the bottom. Both share the factor ${0}$, the one that made them 0.', { 0: toText(factor) }) },
          { tag: 'calc', line: `lim ${v}→${numText(to)} (${show(reduced)})`, why: t('Cancel ${0}$ from the top and the bottom. This is allowed because {1} only gets close to {2}, it is never equal to it.', { 0: toText(factor), 1: v, 2: numText(to) }) },
          { tag: 'calc', line: at(reduced), why: t('Now nothing breaks: put {0} = {1} in.', { 0: v, 1: numText(to) }) },
          { tag: 'final', line: answer, why: t('Work out the numbers.') },
        ];
      }
    }
  }
  const lh = div(simp(diff(body.n, v)), simp(diff(body.d, v)));
  return [
    tryIt,
    { tag: 'calc', line: `lim ${v}→${numText(to)} (${show(lh)})`, why: t('Substituting gives 0/0. **L’Hôpital’s rule**: differentiate the top and the bottom separately (not as a quotient), then try the limit again.'), rule: "\\lim \\frac{f}{g} = \\lim \\frac{f'}{g'}" },
    { tag: 'calc', line: at(lh), why: t('Now put {0} = {1} into the new top and bottom.', { 0: v, 1: numText(to) }) },
    { tag: 'final', line: answer, why: t('Work out the numbers.') },
  ];
}
