import { E, Fn, N, V, add, diff, div, equiv, ev, fn, has, isVar, mul, neg, pow, simp, subst } from './expr';

/**
 * A table-driven integrator for what Calculus 1 and 2 actually set:
 * polynomials, the standard table, a linear inside, u-substitution and
 * tabular integration by parts. It never has to be complete — a student's
 * antiderivative is checked by differentiating it — this is only for hints,
 * worked routes and recognising well-known wrong answers.
 */

export type How = 'power' | 'table' | 'linear' | 'usub' | 'parts';

/** The usual ways an antiderivative goes wrong. */
export type IntFlaw = 'no-divide' | 'divide-old' | 'trig-sign' | 'inner-ignored';

interface Ctx {
  v: string;
  flaw?: IntFlaw;
  hit: boolean;
  how: How;
  /** u for a substitution, or the parts split — kept for the explanation. */
  u?: E;
  dv?: E;
}

const RANK: Record<How, number> = { power: 0, table: 1, linear: 2, usub: 3, parts: 4 };
const mark = (c: Ctx, how: How): void => {
  if (RANK[how] > RANK[c.how]) c.how = how;
};

/** Coefficients of a polynomial in v, lowest power first — or null when it isn't one. */
export function toPoly(e: E, v: string): number[] | null {
  const padd = (a: number[], b: number[]): number[] => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
  const pmul = (a: number[], b: number[]): number[] => {
    const out = new Array<number>(a.length + b.length - 1).fill(0);
    a.forEach((x, i) => b.forEach((y, j) => (out[i + j] += x * y)));
    return out;
  };
  switch (e.t) {
    case 'n':
      return Number.isFinite(e.v) ? [e.v] : null;
    case 'v':
      return e.name === v ? [0, 1] : e.name === 'pi' || e.name === 'e' ? [ev(e, {})] : null;
    case 'neg': {
      const p = toPoly(e.a, v);
      return p && p.map((x) => -x);
    }
    case '+': {
      let acc: number[] = [0];
      for (const t of e.a) {
        const p = toPoly(t, v);
        if (!p) return null;
        acc = padd(acc, p);
      }
      return acc;
    }
    case '*': {
      let acc: number[] = [1];
      for (const t of e.a) {
        const p = toPoly(t, v);
        if (!p || acc.length + p.length > 14) return null;
        acc = pmul(acc, p);
      }
      return acc;
    }
    case '/': {
      const n = toPoly(e.n, v);
      const d = toPoly(e.d, v);
      if (!n || !d || d.length !== 1 || d[0] === 0) return null;
      return n.map((x) => x / d[0]);
    }
    case '^': {
      const b = toPoly(e.b, v);
      if (!b || e.e.t !== 'n' || !Number.isInteger(e.e.v) || e.e.v < 0 || e.e.v > 8) return null;
      let acc: number[] = [1];
      for (let i = 0; i < e.e.v; i++) {
        if (acc.length + b.length > 14) return null;
        acc = pmul(acc, b);
      }
      return acc;
    }
    default:
      return null;
  }
}

export function polyToExpr(c: number[], v: string): E {
  const terms: E[] = [];
  for (let k = c.length - 1; k >= 0; k--) {
    if (Math.abs(c[k]) < 1e-12) continue;
    terms.push(k === 0 ? N(c[k]) : mul(N(c[k]), k === 1 ? V(v) : pow(V(v), N(k))));
  }
  return terms.length ? simp(add(...terms)) : N(0);
}

/** ∫ xⁿ dx, with the classic slips available. */
function powerRule(x: E, n: number, c: Ctx): E {
  if (n === -1) return fn('ln', fn('abs', x));
  if (c.flaw === 'no-divide') {
    c.hit = true;
    return pow(x, N(n + 1));
  }
  if (c.flaw === 'divide-old' && n !== 0) {
    c.hit = true;
    return div(pow(x, N(n + 1)), N(n));
  }
  return div(pow(x, N(n + 1)), N(n + 1));
}

/** ∫ g(t) dt for one of the standard functions of a plain variable. */
function table(name: Fn, t: E, c: Ctx): E | null {
  const flip = c.flaw === 'trig-sign';
  switch (name) {
    case 'sin':
      if (flip) c.hit = true;
      return flip ? fn('cos', t) : neg(fn('cos', t));
    case 'cos':
      if (flip) c.hit = true;
      return flip ? neg(fn('sin', t)) : fn('sin', t);
    case 'tan':
      return neg(fn('ln', fn('abs', fn('cos', t))));
    case 'cot':
      return fn('ln', fn('abs', fn('sin', t)));
    case 'sec':
      return fn('ln', fn('abs', add(fn('sec', t), fn('tan', t))));
    case 'ln':
      return add(mul(t, fn('ln', t)), neg(t));
    case 'sqrt':
      return div(mul(N(2), pow(t, N(1.5))), N(3));
    case 'sinh':
      return fn('cosh', t);
    case 'cosh':
      return fn('sinh', t);
    default:
      return null;
  }
}

/** ∫ OUTER(t) dt where the outer function wraps a bare variable t. */
export function outer(e: E, t: string, c: Ctx = { v: t, hit: false, how: 'power' }): E | null {
  const T = V(t);
  if (isVar(e, t)) return powerRule(T, 1, c);
  if (e.t === 'f' && isVar(e.a, t)) return table(e.name, T, c);
  if (e.t === '^') {
    if (isVar(e.b, t) && e.e.t === 'n') return powerRule(T, e.e.v, c);
    if (!has(e.b, t) && isVar(e.e, t)) return isVar(e.b, 'e') ? e : div(e, fn('ln', e.b));
    if (e.b.t === 'f' && isVar(e.b.a, t) && e.e.t === 'n') {
      const g = e.b.name;
      if (e.e.v === 2 && g === 'sec') return fn('tan', T);
      if (e.e.v === 2 && g === 'csc') return neg(fn('cot', T));
      if (e.e.v === 2 && g === 'sin') return add(div(T, N(2)), neg(div(fn('sin', mul(N(2), T)), N(4))));
      if (e.e.v === 2 && g === 'cos') return add(div(T, N(2)), div(fn('sin', mul(N(2), T)), N(4)));
    }
  }
  if (e.t === '/' && !has(e.n, t)) {
    const d = e.d;
    const scale = (r: E): E => (e.n.t === 'n' && e.n.v === 1 ? r : mul(e.n, r));
    if (isVar(d, t)) return scale(fn('ln', fn('abs', T)));
    if (d.t === '^' && isVar(d.b, t) && d.e.t === 'n') return scale(powerRule(T, -d.e.v, c));
    if (d.t === 'f' && d.name === 'sqrt' && isVar(d.a, t)) return scale(mul(N(2), fn('sqrt', T)));
    const p = toPoly(d, t);
    if (p && p.length === 3 && p[1] === 0 && p[0] > 0 && p[2] > 0) {
      const a = Math.sqrt(p[0] / p[2]);
      return scale(div(fn('atan', div(T, N(a))), N(a * p[2])));
    }
    if (d.t === 'f' && d.name === 'sqrt') {
      const q = toPoly(d.a, t);
      if (q && q.length === 3 && q[1] === 0 && q[0] > 0 && q[2] === -1) return scale(fn('asin', div(T, N(Math.sqrt(q[0])))));
    }
  }
  return null;
}

/** The "insides" a substitution could use: arguments, bases of powers, exponents, denominators. */
export function insides(e: E, v: string, out: E[] = []): E[] {
  const push = (u: E): void => {
    if (has(u, v) && !isVar(u, v)) out.push(u);
  };
  switch (e.t) {
    case 'f':
      push(e.a);
      insides(e.a, v, out);
      break;
    case '^':
      if (has(e.b, v)) push(e.b);
      if (has(e.e, v)) push(e.e);
      insides(e.b, v, out);
      insides(e.e, v, out);
      break;
    case '/':
      push(e.d);
      insides(e.n, v, out);
      insides(e.d, v, out);
      break;
    case '+':
    case '*':
      e.a.forEach((x) => insides(x, v, out));
      break;
    case 'neg':
      insides(e.a, v, out);
      break;
    default:
  }
  return out;
}

const PTS = [0.41, 0.93, 1.37, 2.2, -0.6, 3.1];

/** If e = g(u)·u′ for some g, return g written in the fresh variable t. Found by rewriting, confirmed by numbers. */
export function inTermsOf(e: E, u: E, v: string): E | null {
  const du = simp(diff(u, v));
  const key = JSON.stringify(u);
  const swap = (x: E): E => {
    if (JSON.stringify(x) === key) return V('§');
    switch (x.t) {
      case '+':
      case '*':
        return { t: x.t, a: x.a.map(swap) };
      case '/':
        return div(swap(x.n), swap(x.d));
      case '^':
        return pow(swap(x.b), swap(x.e));
      case 'neg':
        return neg(swap(x.a));
      case 'f':
        return fn(x.name, swap(x.a));
      default:
        return x;
    }
  };
  // every factor that still mentions v after the swap must cancel against u′
  const swapped = swap(e);
  const factors = swapped.t === '*' ? swapped.a : swapped.t === '/' ? [swapped.n, pow(swapped.d, N(-1))] : [swapped];
  const keep = factors.filter((f) => !has(f, v));
  const drop = factors.filter((f) => has(f, v));
  if (keep.length === 0 && drop.length === 0) return null;
  const leftover = drop.length ? mul(...drop) : N(1);
  // leftover / u′ has to be one fixed number
  let k: number | null = null;
  for (const x of PTS) {
    const a = ev(leftover, { [v]: x });
    const b = ev(du, { [v]: x });
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b) < 1e-9) continue;
    const r = a / b;
    if (k === null) k = r;
    else if (Math.abs(r - k) > 1e-7 * Math.max(1, Math.abs(k))) return null;
  }
  if (k === null || Math.abs(k) < 1e-12) return null;
  const g = keep.length ? mul(N(k), ...keep) : N(k);
  return subst(g, '§', V('§'));
}

function go(eIn: E, c: Ctx): E | null {
  const v = c.v;
  const e = eIn;
  if (!has(e, v)) return mul(e, V(v));
  if (e.t === 'neg') {
    const r = go(e.a, c);
    return r && neg(r);
  }
  if (e.t === '+') {
    const parts: E[] = [];
    for (const t of e.a) {
      const r = go(t, c);
      if (!r) return null;
      parts.push(r);
    }
    return add(...parts);
  }
  // constants step outside
  if (e.t === '*') {
    const consts = e.a.filter((f) => !has(f, v));
    if (consts.length) {
      const r = go(mul(...e.a.filter((f) => has(f, v))), c);
      return r && mul(...consts, r);
    }
  }
  if (e.t === '/' && !has(e.d, v)) {
    const r = go(e.n, c);
    return r && div(r, e.d);
  }
  if (e.t === '/' && e.n.t === '*') {
    const consts = e.n.a.filter((f) => !has(f, v));
    const rest = e.n.a.filter((f) => has(f, v));
    if (consts.length) {
      const r = go(div(rest.length ? mul(...rest) : N(1), e.d), c);
      return r && mul(...consts, r);
    }
  }

  if (e.t === '/' && e.d.t === '*') {
    const consts = e.d.a.filter((f) => !has(f, v));
    if (consts.length) {
      const r = go(div(e.n, mul(...e.d.a.filter((f) => has(f, v)))), c);
      return r && div(r, mul(...consts));
    }
  }

  // straight from the table
  const direct = outer(e, v, c);
  if (direct) {
    mark(c, e.t === '^' || isVar(e, v) || e.t === '/' ? 'power' : 'table');
    return direct;
  }

  // a polynomial, possibly still in brackets — unless a substitution would keep it folded
  const poly = toPoly(e, v);
  const folded = poly && insides(e, v).some((u) => u.t === '+') && poly.length > 3;
  if (poly && !folded) {
    mark(c, 'power');
    return add(...poly.map((coef, k) => mul(N(coef), powerRule(V(v), k, c))).filter((_, k) => Math.abs(poly[k]) > 1e-12).reverse());
  }

  // (x² + 1)/x → x + 1/x
  if (e.t === '/' && e.d.t !== '+') {
    const top = simp(e.n);
    if (top.t === '+') {
      const parts: E[] = [];
      for (const t of top.a) {
        const r = go(simp(div(t, e.d)), c);
        if (!r) return null;
        parts.push(r);
      }
      return add(...parts);
    }
  }

  // substitution: some inside u whose derivative is sitting in the problem
  const seen = new Set<string>();
  for (const u of insides(e, v)) {
    const k = JSON.stringify(u);
    if (seen.has(k)) continue;
    seen.add(k);
    const g = inTermsOf(e, u, v);
    if (!g) continue;
    const linear = !has(simp(diff(u, v)), v);
    let G: E | null;
    if (c.flaw === 'inner-ignored') {
      // integrate the outside and forget the inside's derivative altogether
      const bare = inTermsOf(mul(e, simp(diff(u, v))), u, v);
      const sub: Ctx = { v: '§', hit: false, how: 'power' };
      G = bare ? go(simp(bare), sub) : null;
      if (G) c.hit = true;
    } else {
      const sub: Ctx = { v: '§', flaw: c.flaw, hit: false, how: 'power' };
      G = go(simp(g), sub);
      if (sub.hit) c.hit = true;
    }
    if (!G) continue;
    mark(c, linear ? 'linear' : 'usub');
    if (!linear) c.u = u;
    return subst(G, '§', u);
  }
  if (poly) {
    mark(c, 'power');
    return add(...poly.map((coef, k) => mul(N(coef), powerRule(V(v), k, c))).filter((_, k) => Math.abs(poly[k]) > 1e-12).reverse());
  }

  // by parts: polynomial × (e^…, sin, cos), differentiate the polynomial away
  if (e.t === '*' && e.a.length >= 2) {
    const polys = e.a.filter((f) => toPoly(f, v));
    const others = e.a.filter((f) => !toPoly(f, v));
    if (polys.length && others.length === 1) {
      let p: E = simp(mul(...polys));
      const first = p;
      let w: E | null = others[0];
      const isLog = w.t === 'f' && w.name === 'ln';
      if (isLog) {
        // ln goes the other way round: differentiate the log, integrate the polynomial
        const P = go(first, { v, hit: false, how: 'power' });
        if (!P) return null;
        const rest = go(simp(mul(P, diff(w, v))), { v, hit: false, how: 'power' });
        if (!rest) return null;
        mark(c, 'parts');
        c.u = w;
        c.dv = first;
        return add(mul(P, w), neg(rest));
      }
      const terms: E[] = [];
      let sign = 1;
      for (let i = 0; i < 8 && w; i++) {
        w = go(w, { v, hit: false, how: 'power' });
        if (!w) return null;
        terms.push(sign > 0 ? mul(p, w) : neg(mul(p, w)));
        p = simp(diff(p, v));
        if (p.t === 'n' && p.v === 0) {
          mark(c, 'parts');
          c.u = first;
          c.dv = others[0];
          return add(...terms);
        }
        sign = -sign;
      }
    }
  }
  if (e.t === 'f' && e.name === 'ln') {
    const r = go(mul(N(1), e), c);
    if (r) return r;
  }
  return null;
}

export interface Antiderivative {
  F: E;
  how: How;
  u?: E;
  dv?: E;
}

/** An antiderivative of e (without the + C), or null when this integrator doesn't know one. */
export function integrate(e: E, v: string): Antiderivative | null {
  const c: Ctx = { v, hit: false, how: 'power' };
  let F: E | null;
  try {
    F = go(simp(e), c);
  } catch {
    return null;
  }
  if (!F) return null;
  const tidy = simp(F);
  // never trust a table: differentiate it back
  if (equiv(diff(tidy, v), e, v) !== true) return null;
  return { F: tidy, how: c.how, u: c.u, dv: c.dv };
}

/** What the antiderivative would be if one named slip were made — or null when that slip can't happen here. */
export function integrateWith(e: E, v: string, flaw: IntFlaw): E | null {
  const c: Ctx = { v, flaw, hit: false, how: 'power' };
  try {
    const F = go(simp(e), c);
    return F && c.hit ? simp(F) : null;
  } catch {
    return null;
  }
}
