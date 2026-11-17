import { normalizeInput } from '../parse';

/**
 * A second, smaller expression engine for calculus.
 *
 * The algebra engine works in exact polynomial normal forms, which is what
 * makes it able to say *which* rule broke. Calculus needs sin, ln, e^x,
 * d/dx, ∫ and lim, where exact normal forms don't exist — so here two lines
 * are compared by evaluating them at a spread of points, and derivatives are
 * taken symbolically.
 */

export type Fn = 'sin' | 'cos' | 'tan' | 'sec' | 'csc' | 'cot' | 'ln' | 'sqrt' | 'abs' | 'asin' | 'acos' | 'atan' | 'sinh' | 'cosh' | 'tanh';

export type E =
  | { t: 'n'; v: number }
  | { t: 'v'; name: string }
  | { t: '+'; a: E[] }
  | { t: '*'; a: E[] }
  | { t: '/'; n: E; d: E }
  | { t: '^'; b: E; e: E }
  | { t: 'neg'; a: E }
  | { t: 'f'; name: Fn; a: E }
  | { t: 'd'; a: E; v: string }
  | { t: 'int'; a: E; v: string; lo?: E; hi?: E }
  | { t: 'lim'; a: E; v: string; to: E; side?: 1 | -1 };

export const N = (v: number): E => ({ t: 'n', v });
export const V = (name: string): E => ({ t: 'v', name });
export const add = (...a: E[]): E => (a.length === 1 ? a[0] : { t: '+', a });
export const mul = (...a: E[]): E => (a.length === 1 ? a[0] : { t: '*', a });
export const div = (n: E, d: E): E => ({ t: '/', n, d });
export const pow = (b: E, e: E): E => ({ t: '^', b, e });
export const neg = (a: E): E => ({ t: 'neg', a });
export const fn = (name: Fn, a: E): E => ({ t: 'f', name, a });
export const isVar = (e: E, name: string): boolean => e.t === 'v' && e.name === name;
const isNum = (e: E, v: number): boolean => e.t === 'n' && e.v === v;

export class CalcParseError extends Error {}

/* ───────────── reading ───────────── */

type Tok = { k: 'num'; v: number } | { k: 'id'; s: string } | { k: 'var'; s: string } | { k: 'op'; s: string } | { k: 'dd'; s: string } | { k: 'end' };

const NAMES = ['arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sqrt', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'exp', 'abs', 'lim', 'int', 'inf', 'pi'];
const FN_ALIAS: Record<string, Fn> = { arcsin: 'asin', arccos: 'acos', arctan: 'atan', log: 'ln' };

/** Make calculus notation uniform: ∫ → int, d/dx → one token, → for limits. */
export function pre(src: string): string {
  return normalizeInput(src.replace(/⁺/g, '^+').replace(/([0-9a-zA-Z)])⁻(?![⁰¹²³⁴⁵⁶⁷⁸⁹])/g, '$1^-'))
    .replace(/π/g, ' pi ')
    .replace(/∞/g, ' inf ')
    .replace(/infinity/gi, ' inf ')
    .replace(/->|→|⟶|⇒/g, '→')
    .replace(/∫/g, ' int ')
    .replace(/[′’‘`]/g, "'")
    .replace(/\\(?:left|right|,|;|!)/g, '')
    .replace(/\bd\s*\/\s*d\s*([a-z])\b/g, ' §$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] ?? '')) {
        j++;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
      }
      if (j === i) throw new CalcParseError('A number is missing its digits.');
      out.push({ k: 'num', v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (c === '§') {
      out.push({ k: 'dd', s: src[i + 1] ?? 'x' });
      i += 2;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
      let word = src.slice(i, j);
      while (word.length) {
        const lower = word.toLowerCase();
        const name = NAMES.find((n) => lower.startsWith(n));
        if (name) {
          out.push({ k: 'id', s: name });
          word = word.slice(name.length);
        } else {
          out.push({ k: 'var', s: word[0] });
          word = word.slice(1);
        }
      }
      i = j;
      continue;
    }
    if ('+-*/^()[]{}|,_→'.includes(c)) {
      out.push({ k: 'op', s: c });
      i++;
      continue;
    }
    throw new CalcParseError(`I can’t read “${c}” as maths.`);
  }
  out.push({ k: 'end' });
  return out;
}

class Parser {
  private i = 0;
  private stop: number;
  private abs = 0;
  constructor(private toks: Tok[], private dflt: string) {
    this.stop = toks.length - 1;
  }

  private peek(o = 0): Tok {
    const j = this.i + o;
    return j >= this.stop ? { k: 'end' } : this.toks[j];
  }
  private isOp(s: string, o = 0): boolean {
    const t = this.peek(o);
    return t.k === 'op' && t.s === s;
  }
  private eat(s: string): boolean {
    if (this.isOp(s)) {
      this.i++;
      return true;
    }
    return false;
  }
  private need(s: string): void {
    if (!this.eat(s)) throw new CalcParseError(s === ')' ? 'A bracket isn’t closed.' : `I expected “${s}” here.`);
  }

  all(): E {
    const e = this.expr();
    if (this.peek().k !== 'end') throw new CalcParseError('There’s something after the end of this line I can’t read.');
    return e;
  }

  expr(): E {
    const terms: E[] = [];
    let first = true;
    for (;;) {
      let sign = 1;
      if (this.eat('+')) sign = 1;
      else if (this.eat('-')) sign = -1;
      else if (!first) break;
      const t = this.term();
      terms.push(sign < 0 ? neg(t) : t);
      first = false;
    }
    return add(...terms);
  }

  private startsFactor(): boolean {
    const t = this.peek();
    if (t.k === 'num' || t.k === 'var' || t.k === 'id' || t.k === 'dd') return true;
    if (t.k === 'op') return t.s === '(' || t.s === '[' || (t.s === '|' && this.abs === 0);
    return false;
  }

  term(): E {
    let left = this.unary();
    for (;;) {
      if (this.eat('*')) left = flatMul(left, this.unary());
      else if (this.eat('/')) left = div(left, this.unary());
      else if (this.startsFactor()) left = flatMul(left, this.power());
      else break;
    }
    return left;
  }

  private unary(): E {
    if (this.eat('-')) return neg(this.unary());
    if (this.eat('+')) return this.unary();
    return this.power();
  }

  private exponent(): E {
    if (this.eat('(')) {
      const e = this.expr();
      this.need(')');
      return e;
    }
    if (this.eat('{')) {
      const e = this.expr();
      this.need('}');
      return e;
    }
    if (this.eat('-')) return neg(this.exponent());
    const a = this.atom();
    return this.eat('^') ? pow(a, this.exponent()) : a;
  }

  private power(): E {
    const base = this.primary();
    if (this.isOp('^')) {
      this.i++;
      return pow(base, this.exponent());
    }
    return base;
  }

  private atom(): E {
    const t = this.peek();
    if (t.k === 'num') {
      this.i++;
      return N(t.v);
    }
    if (t.k === 'var') {
      this.i++;
      return V(t.s);
    }
    if (t.k === 'id' && (t.s === 'pi' || t.s === 'inf')) {
      this.i++;
      return t.s === 'pi' ? V('pi') : N(Infinity);
    }
    throw new CalcParseError(t.k === 'end' ? 'This line stops in the middle.' : 'Something is missing here.');
  }

  private primary(): E {
    const t = this.peek();
    if (t.k === 'op') {
      if (t.s === '(' || t.s === '[' || t.s === '{') {
        this.i++;
        const e = this.expr();
        this.need(t.s === '(' ? ')' : t.s === '[' ? ']' : '}');
        return e;
      }
      if (t.s === '|') {
        this.i++;
        this.abs++;
        const e = this.expr();
        this.abs--;
        this.need('|');
        return fn('abs', e);
      }
      throw new CalcParseError(t.s === ')' ? 'There’s a closing bracket with nothing to close.' : 'Something is missing here.');
    }
    if (t.k === 'dd') {
      this.i++;
      const a = this.isOp('(') || this.isOp('[') ? this.primary() : this.term();
      return { t: 'd', a, v: t.s };
    }
    if (t.k === 'id') {
      if (t.s === 'pi' || t.s === 'inf') return this.atom();
      this.i++;
      if (t.s === 'int') return this.integral();
      if (t.s === 'lim') return this.limit();
      return this.call(t.s);
    }
    return this.atom();
  }

  /** sin x, sin 2x, sin(x + 1), sin^2 x */
  private call(word: string): E {
    let power: E | null = null;
    if (this.eat('^')) power = this.exponent();
    let arg: E;
    if (this.eat('(')) {
      arg = this.expr();
      this.need(')');
    } else if (this.isOp('|')) arg = this.primary();
    else {
      const parts: E[] = [];
      for (;;) {
        const t = this.peek();
        if (t.k === 'num' || t.k === 'var' || (t.k === 'id' && t.s === 'pi')) {
          let a = this.atom();
          if (this.eat('^')) a = pow(a, this.exponent());
          parts.push(a);
        } else break;
      }
      if (!parts.length) throw new CalcParseError(`“${word}” needs something after it, like ${word}(x).`);
      arg = mul(...parts);
    }
    const name = FN_ALIAS[word] ?? word;
    let res: E = word === 'exp' ? pow(V('e'), arg) : fn(name as Fn, arg);
    if (power) res = pow(res, power);
    return res;
  }

  private bound(): E {
    if (this.eat('(')) {
      const e = this.expr();
      this.need(')');
      return e;
    }
    if (this.eat('{')) {
      const e = this.expr();
      this.need('}');
      return e;
    }
    if (this.eat('-')) return neg(this.bound());
    return this.atom();
  }

  private integral(): E {
    let lo: E | undefined;
    let hi: E | undefined;
    if (this.eat('_')) {
      lo = this.bound();
      this.need('^');
      hi = this.bound();
    } else if (this.isOp('[')) {
      // ∫[a, b] … — only when there really is a comma before the closing bracket
      let depth = 0;
      let comma = false;
      for (let k = this.i; k < this.stop; k++) {
        const t = this.toks[k];
        if (t.k !== 'op') continue;
        if (t.s === '[' || t.s === '(') depth++;
        if (t.s === ']' || t.s === ')') {
          depth--;
          if (depth === 0) break;
        }
        if (t.s === ',' && depth === 1) comma = true;
      }
      if (comma) {
        this.i++;
        lo = this.expr();
        this.need(',');
        hi = this.expr();
        this.need(']');
      }
    }
    // the integrand runs up to its "dx"
    let depth = 0;
    let at = -1;
    for (let k = this.i; k < this.stop; k++) {
      const t = this.toks[k];
      if (t.k === 'op' && (t.s === '(' || t.s === '[')) depth++;
      if (t.k === 'op' && (t.s === ')' || t.s === ']')) {
        depth--;
        if (depth < 0) break;
      }
      const nx = this.toks[k + 1];
      if (depth === 0 && t.k === 'var' && t.s === 'd' && nx && nx.k === 'var' && k + 1 < this.stop) {
        at = k;
        break;
      }
    }
    let body: E;
    let v = this.dflt;
    if (at >= 0) {
      const save = this.stop;
      this.stop = at;
      body = this.i === at ? N(1) : this.expr();
      if (this.i !== at) throw new CalcParseError('I couldn’t read what is inside the integral.');
      this.stop = save;
      v = (this.toks[at + 1] as { s: string }).s;
      this.i = at + 2;
    } else body = this.term();
    return { t: 'int', a: body, v, lo, hi };
  }

  private limit(): E {
    this.eat('_');
    const open = this.eat('(') ? ')' : this.eat('{') ? '}' : '';
    const vt = this.peek();
    if (vt.k !== 'var') throw new CalcParseError('Write a limit like: lim x→2 …');
    this.i++;
    this.need('→');
    let sign = 1;
    if (this.eat('-')) sign = -1;
    this.eat('+');
    let to = this.atom();
    if (sign < 0) to = to.t === 'n' ? N(-to.v) : neg(to);
    let side: 1 | -1 | undefined;
    const mark = (o: number): 1 | -1 | undefined => (this.isOp('+', o) ? 1 : this.isOp('-', o) ? -1 : undefined);
    const after = (o: number): boolean => {
      const t = this.peek(o);
      return t.k === 'end' || (t.k === 'op' && ')}]'.includes(t.s)) || t.k === 'id' || t.k === 'op';
    };
    if (this.isOp('^') && mark(1) && after(2) && !this.isOp('(', 2)) {
      side = mark(1);
      this.i += 2;
    } else if (open && mark(0) && this.isOp(open, 1)) {
      side = mark(0);
      this.i += 1;
    }
    if (open) this.need(open);
    const body = this.expr();
    return { t: 'lim', a: body, v: vt.s, to, side };
  }
}

function flatMul(a: E, b: E): E {
  return { t: '*', a: [...(a.t === '*' ? a.a : [a]), ...(b.t === '*' ? b.a : [b])] };
}

/** Parse one calculus expression. Throws CalcParseError with a sentence a student can act on. */
export function parseCalc(src: string, variable = 'x'): E {
  const text = pre(src);
  if (!text) throw new CalcParseError('This line is empty.');
  return new Parser(tokenize(text), variable).all();
}

export function tryParse(src: string, variable = 'x'): E | null {
  try {
    return parseCalc(src, variable);
  } catch {
    return null;
  }
}

/* ───────────── looking inside ───────────── */

/** Does the expression depend on v? (A variable bound by a definite integral or a limit doesn't count.) */
export function has(e: E, v: string): boolean {
  switch (e.t) {
    case 'n':
      return false;
    case 'v':
      return e.name === v;
    case '+':
    case '*':
      return e.a.some((x) => has(x, v));
    case '/':
      return has(e.n, v) || has(e.d, v);
    case '^':
      return has(e.b, v) || has(e.e, v);
    case 'neg':
    case 'f':
      return has(e.a, v);
    case 'd':
      return has(e.a, v);
    case 'int':
      if (e.lo && e.hi) return has(e.lo, v) || has(e.hi, v) || (e.v !== v && has(e.a, v));
      // ∫ 7 dx is 7x: an integral without limits is a function of its own variable, whatever is inside
      return e.v === v || has(e.a, v);
    case 'lim':
      return has(e.to, v) || (e.v !== v && has(e.a, v));
  }
}

/** True when a d/dx, ∫ or lim is still waiting to be worked out. */
export function pending(e: E): boolean {
  switch (e.t) {
    case 'n':
    case 'v':
      return false;
    case '+':
    case '*':
      return e.a.some(pending);
    case '/':
      return pending(e.n) || pending(e.d);
    case '^':
      return pending(e.b) || pending(e.e);
    case 'neg':
    case 'f':
      return pending(e.a);
    default:
      return true;
  }
}

export function mentions(e: E, name: string): boolean {
  switch (e.t) {
    case 'n':
      return false;
    case 'v':
      return e.name === name;
    case '+':
    case '*':
      return e.a.some((x) => mentions(x, name));
    case '/':
      return mentions(e.n, name) || mentions(e.d, name);
    case '^':
      return mentions(e.b, name) || mentions(e.e, name);
    case 'int':
      return mentions(e.a, name) || (!!e.lo && mentions(e.lo, name)) || (!!e.hi && mentions(e.hi, name));
    case 'lim':
      return mentions(e.a, name) || mentions(e.to, name);
    default:
      return mentions(e.a, name);
  }
}

export function subst(e: E, name: string, by: E): E {
  const s = (x: E): E => subst(x, name, by);
  switch (e.t) {
    case 'n':
      return e;
    case 'v':
      return e.name === name ? by : e;
    case '+':
    case '*':
      return { t: e.t, a: e.a.map(s) };
    case '/':
      return div(s(e.n), s(e.d));
    case '^':
      return pow(s(e.b), s(e.e));
    case 'neg':
      return neg(s(e.a));
    case 'f':
      return fn(e.name, s(e.a));
    case 'd':
      return { ...e, a: s(e.a) };
    case 'int':
      return { ...e, a: s(e.a), lo: e.lo && s(e.lo), hi: e.hi && s(e.hi) };
    case 'lim':
      return { ...e, a: s(e.a), to: s(e.to) };
  }
}

/* ───────────── numbers ───────────── */

/** x as a fraction with a small denominator, if it is one. */
export function ratio(x: number, maxDen = 720): [number, number] | null {
  if (!Number.isFinite(x)) return null;
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(x * d);
    if (Math.abs(x - n / d) <= 1e-9 * Math.max(1, Math.abs(x))) return [n, d];
  }
  return null;
}

/** Round away floating-point dust: 0.49999999 → 0.5, 2.0000001 → 2. */
export function nice(x: number): number {
  if (!Number.isFinite(x)) return x;
  for (let d = 1; d <= 60; d++) {
    const n = Math.round(x * d);
    if (Math.abs(x - n / d) <= 2e-6 * Math.max(1, Math.abs(x))) return n / d;
  }
  return x;
}

export function numText(x: number): string {
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (Number.isNaN(x)) return 'DNE';
  const r = ratio(x, 360);
  if (r) return r[1] === 1 ? String(r[0]) : `${r[0]}/${r[1]}`;
  const p = ratio(x / Math.PI, 24);
  if (p && p[0] !== 0) return `${p[0] === 1 ? '' : p[0] === -1 ? '-' : p[0]}pi${p[1] === 1 ? '' : `/${p[1]}`}`;
  return String(Number(x.toPrecision(5)));
}

const CONST: Record<string, number> = { e: Math.E, pi: Math.PI, C: 0, K: 0 };

export class Indefinite extends Error {}

function neville(hs: number[], fs: number[]): number {
  const p = [...fs];
  for (let k = 1; k < hs.length; k++) for (let i = 0; i < hs.length - k; i++) p[i] = (hs[i + k] * p[i] - hs[i] * p[i + 1]) / (hs[i + k] - hs[i]);
  return p[0];
}

/** What f(a + dir·h) heads for as h shrinks: a number, ±Infinity, or NaN when it doesn't settle. */
function oneSided(g: (h: number) => number): number {
  const at = (h: number): number => {
    try {
      return g(h);
    } catch {
      return NaN;
    }
  };
  const hs = [0.04, 0.02, 0.01, 0.005, 0.0025];
  const fs = hs.map(at);
  if (fs.every(Number.isFinite)) {
    const a = neville(hs.slice(0, 4), fs.slice(0, 4));
    const b = neville(hs.slice(1), fs.slice(1));
    if (Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(a))) return b;
  }
  const far = [0.0025, 1e-5, 1e-8].map(at);
  if (far.some((x) => x === Infinity || x === -Infinity)) return far.find((x) => !Number.isFinite(x) && !Number.isNaN(x)) as number;
  if (far.every(Number.isFinite)) {
    const [p, q, r] = far.map(Math.abs);
    if (r > q && q > p && r > 12 && Math.sign(far[2]) === Math.sign(far[1])) return far[2] > 0 ? Infinity : -Infinity;
    // slow but steady: accept the finest value when the last two agree
    if (Math.abs(far[2] - far[1]) <= 1e-4 * Math.max(1, Math.abs(far[1]))) return far[1];
  }
  return NaN;
}

export function numericLimit(f: (x: number) => number, to: number, side?: 1 | -1): number {
  if (to === Infinity) return nice(oneSided((h) => f(1 / h)));
  if (to === -Infinity) return nice(oneSided((h) => f(-1 / h)));
  const r = side === -1 ? NaN : oneSided((h) => f(to + h));
  const l = side === 1 ? NaN : oneSided((h) => f(to - h));
  if (side === 1) return nice(r);
  if (side === -1) return nice(l);
  if (Number.isNaN(r)) return nice(l);
  if (Number.isNaN(l)) return nice(r);
  if (r === l) return nice(r);
  if (Number.isFinite(r) && Number.isFinite(l) && Math.abs(r - l) <= 1e-5 * Math.max(1, Math.abs(r))) return nice((r + l) / 2);
  return NaN;
}

function midpoint(g: (t: number) => number, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += g((i + 0.5) / n);
  return s / n;
}

/** Definite integral by numbers. Infinite limits are folded onto (0, 1); a divergent integral comes back as ±Infinity. */
export function quad(f: (x: number) => number, a: number, b: number): number {
  if (a === b) return 0;
  if (a > b) return -quad(f, b, a);
  if (a === -Infinity && b === Infinity) return quad(f, -Infinity, 0) + quad(f, 0, Infinity);
  let g: (t: number) => number;
  if (b === Infinity) g = (t) => f(a + t / (1 - t)) / ((1 - t) * (1 - t));
  else if (a === -Infinity) g = (t) => f(b - t / (1 - t)) / ((1 - t) * (1 - t));
  else {
    const fa = f(a);
    const fb = f(b);
    if (Number.isFinite(fa) && Number.isFinite(fb)) {
      const n = 2000;
      const h = (b - a) / n;
      let s = fa + fb;
      for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
      return nice((s * h) / 3);
    }
    g = (t) => f(a + (b - a) * t) * (b - a);
  }
  const coarse = midpoint(g, 4000);
  const fine = midpoint(g, 32000);
  if (!Number.isFinite(fine)) return NaN;
  if (Math.abs(fine - coarse) > 0.02 * Math.max(1, Math.abs(fine))) return fine > 0 ? Infinity : -Infinity;
  return nice(Number(fine.toPrecision(6)));
}

const derivCache = new WeakMap<object, E>();

/** The value of an expression at a point. Throws Indefinite when an ∫ without limits is in the way. */
export function ev(e: E, env: Record<string, number>): number {
  switch (e.t) {
    case 'n':
      return e.v;
    case 'v': {
      if (e.name in env) return env[e.name];
      if (e.name in CONST) return CONST[e.name];
      // any other letter is a constant the problem carries around (a, k, n …): give it a fixed, unremarkable value
      return 1.3 + (e.name.charCodeAt(0) % 11) * 0.23;
    }
    case '+':
      return e.a.reduce((s, x) => s + ev(x, env), 0);
    case '*':
      return e.a.reduce((s, x) => s * ev(x, env), 1);
    case '/':
      return ev(e.n, env) / ev(e.d, env);
    case '^': {
      const b = ev(e.b, env);
      const x = ev(e.e, env);
      if (b < 0 && !Number.isInteger(x)) {
        // odd roots of negatives are real: (-8)^(1/3)
        const r = ratio(x, 9);
        return r && r[1] % 2 === 1 ? (r[0] % 2 === 0 ? 1 : -1) * Math.pow(-b, x) : NaN;
      }
      return Math.pow(b, x);
    }
    case 'neg':
      return -ev(e.a, env);
    case 'f': {
      const x = ev(e.a, env);
      switch (e.name) {
        case 'sin':
          return Math.sin(x);
        case 'cos':
          return Math.cos(x);
        case 'tan':
          return Math.tan(x);
        case 'sec':
          return 1 / Math.cos(x);
        case 'csc':
          return 1 / Math.sin(x);
        case 'cot':
          return Math.cos(x) / Math.sin(x);
        case 'ln':
          return x > 0 ? Math.log(x) : NaN;
        case 'sqrt':
          return x >= 0 ? Math.sqrt(x) : NaN;
        case 'abs':
          return Math.abs(x);
        case 'asin':
          return Math.asin(x);
        case 'acos':
          return Math.acos(x);
        case 'atan':
          return Math.atan(x);
        case 'sinh':
          return Math.sinh(x);
        case 'cosh':
          return Math.cosh(x);
        case 'tanh':
          return Math.tanh(x);
      }
      return NaN;
    }
    case 'd': {
      let d = derivCache.get(e);
      if (!d) {
        d = diff(e.a, e.v);
        derivCache.set(e, d);
      }
      return ev(d, env);
    }
    case 'int': {
      if (!e.lo || !e.hi) throw new Indefinite();
      const body = e.a;
      const v = e.v;
      return quad((x) => ev(body, { ...env, [v]: x }), ev(e.lo, env), ev(e.hi, env));
    }
    case 'lim': {
      const body = e.a;
      const v = e.v;
      return numericLimit((x) => ev(body, { ...env, [v]: x }), ev(e.to, env), e.side);
    }
  }
}

/* ───────────── differentiating ───────────── */

/** A rule applied the way students commonly misapply it. Used to recognise a wrong line, never to produce an answer. */
export type Flaw =
  | 'power-keep'
  | 'power-nocoef'
  | 'const-kept'
  | 'product-naive'
  | 'product-first'
  | 'quotient-naive'
  | 'quotient-sign'
  | 'quotient-nosquare'
  | 'chain-missing'
  | 'trig-sign'
  | 'exp-power';

export function diff(e: E, v: string, flaw?: Flaw, used?: { hit: boolean }): E {
  const d = (x: E): E => diff(x, v, flaw, used);
  const hit = (): void => {
    if (used) used.hit = true;
  };
  if (!has(e, v)) return N(0);
  switch (e.t) {
    case 'n':
      return N(0);
    case 'v':
      // "1·x¹" with the power left in place is just x again
      if (flaw === 'power-keep') {
        hit();
        return e;
      }
      return N(1);
    case 'neg':
      return neg(d(e.a));
    case '+':
      return add(
        ...e.a.map((t) => {
          if (flaw === 'const-kept' && !has(t, v) && !isNum(t, 0)) {
            hit();
            return t;
          }
          return d(t);
        }),
      );
    case '*': {
      const consts = e.a.filter((f) => !has(f, v));
      const rest = e.a.filter((f) => has(f, v));
      let r: E;
      if (rest.length === 1) r = d(rest[0]);
      else {
        const u = rest[0];
        const w = mul(...rest.slice(1));
        if (flaw === 'product-naive') {
          hit();
          r = mul(d(u), d(w));
        } else if (flaw === 'product-first') {
          hit();
          r = mul(d(u), w);
        } else r = add(mul(d(u), w), mul(u, d(w)));
      }
      return consts.length ? mul(...consts, r) : r;
    }
    case '/': {
      if (!has(e.d, v)) return div(d(e.n), e.d);
      if (!has(e.n, v)) return d(mul(e.n, pow(e.d, N(-1))));
      const f = e.n;
      const g = e.d;
      if (flaw === 'quotient-naive') {
        hit();
        return div(d(f), d(g));
      }
      if (flaw === 'quotient-sign') {
        hit();
        return div(add(mul(f, d(g)), neg(mul(d(f), g))), pow(g, N(2)));
      }
      if (flaw === 'quotient-nosquare') {
        hit();
        return div(add(mul(d(f), g), neg(mul(f, d(g)))), g);
      }
      return div(add(mul(d(f), g), neg(mul(f, d(g)))), pow(g, N(2)));
    }
    case '^': {
      const inner = (b: E): E => {
        if (isVar(b, v)) return N(1);
        if (flaw === 'chain-missing') {
          hit();
          return N(1);
        }
        return d(b);
      };
      if (!has(e.e, v)) {
        const n = e.e;
        if (flaw === 'power-keep') {
          hit();
          return mul(n, pow(e.b, n), inner(e.b));
        }
        if (flaw === 'power-nocoef') {
          hit();
          return mul(pow(e.b, add(n, N(-1))), inner(e.b));
        }
        return mul(n, pow(e.b, add(n, N(-1))), inner(e.b));
      }
      if (!has(e.b, v)) {
        if (flaw === 'exp-power') {
          hit();
          return mul(e.e, pow(e.b, add(e.e, N(-1))));
        }
        const lnA: E = isVar(e.b, 'e') ? N(1) : fn('ln', e.b);
        return mul(pow(e.b, e.e), lnA, inner(e.e));
      }
      return mul(e, add(mul(d(e.e), fn('ln', e.b)), div(mul(e.e, d(e.b)), e.b)));
    }
    case 'f': {
      const u = e.a;
      const flip = flaw === 'trig-sign';
      let outer: E;
      switch (e.name) {
        case 'sin':
          outer = flip ? (hit(), neg(fn('cos', u))) : fn('cos', u);
          break;
        case 'cos':
          outer = flip ? (hit(), fn('sin', u)) : neg(fn('sin', u));
          break;
        case 'tan':
          outer = pow(fn('sec', u), N(2));
          break;
        case 'sec':
          outer = mul(fn('sec', u), fn('tan', u));
          break;
        case 'csc':
          outer = neg(mul(fn('csc', u), fn('cot', u)));
          break;
        case 'cot':
          outer = neg(pow(fn('csc', u), N(2)));
          break;
        case 'ln':
          outer = div(N(1), u.t === 'f' && u.name === 'abs' ? u.a : u);
          if (u.t === 'f' && u.name === 'abs') return isVar(u.a, v) ? outer : flaw === 'chain-missing' ? (hit(), outer) : mul(outer, d(u.a));
          break;
        case 'sqrt':
          outer = div(N(1), mul(N(2), fn('sqrt', u)));
          break;
        case 'abs':
          outer = div(u, fn('abs', u));
          break;
        case 'asin':
          outer = div(N(1), fn('sqrt', add(N(1), neg(pow(u, N(2))))));
          break;
        case 'acos':
          outer = neg(div(N(1), fn('sqrt', add(N(1), neg(pow(u, N(2)))))));
          break;
        case 'atan':
          outer = div(N(1), add(N(1), pow(u, N(2))));
          break;
        case 'sinh':
          outer = fn('cosh', u);
          break;
        case 'cosh':
          outer = fn('sinh', u);
          break;
        default:
          outer = div(N(1), pow(fn('cosh', u), N(2)));
      }
      if (isVar(u, v)) return outer;
      if (flaw === 'chain-missing') {
        hit();
        return outer;
      }
      return mul(outer, d(u));
    }
    case 'd':
      return d(diff(e.a, e.v));
    case 'int':
      // the derivative of ∫f dx is f; a definite integral with fixed limits is just a number
      return !e.lo && !e.hi && e.v === v ? e.a : N(0);
    case 'lim':
      return N(0);
  }
}

/* ───────────── tidying ───────────── */

function negate(e: E): E {
  if (e.t === 'n') return N(-e.v);
  if (e.t === 'neg') return e.a;
  if (e.t === '*' && e.a[0].t === 'n') return mul(N(-e.a[0].v), ...e.a.slice(1));
  if (e.t === '/' && e.n.t === 'n') return div(N(-e.n.v), e.d);
  return neg(e);
}

/** [is it negative?, the same thing without its minus sign] */
export function signOf(e: E): [boolean, E] {
  if (e.t === 'n') return e.v < 0 ? [true, N(-e.v)] : [false, e];
  if (e.t === 'neg') return [true, e.a];
  if (e.t === '*' && e.a[0].t === 'n' && e.a[0].v < 0) return [true, e.a[0].v === -1 ? mul(...e.a.slice(1)) : mul(N(-e.a[0].v), ...e.a.slice(1))];
  if (e.t === '/') {
    const [s, n] = signOf(e.n);
    return s ? [true, div(n, e.d)] : [false, e];
  }
  return [false, e];
}

function product(nums: E[], dens: E[]): E {
  let coef = 1;
  const facs = new Map<string, { base: E; exp: number }>();
  const push = (x: E, s: 1 | -1): void => {
    if (x.t === 'n') {
      coef *= s === 1 ? x.v : 1 / x.v;
      return;
    }
    if (x.t === '*') return x.a.forEach((y) => push(y, s));
    if (x.t === '/') {
      push(x.n, s);
      push(x.d, -s as 1 | -1);
      return;
    }
    if (x.t === 'neg') {
      coef = -coef;
      return push(x.a, s);
    }
    let base: E = x;
    let exp = 1;
    if (x.t === '^' && x.e.t === 'n') {
      base = x.b;
      exp = x.e.v;
    }
    const k = toText(base);
    const f = facs.get(k);
    if (f) f.exp += s * exp;
    else facs.set(k, { base, exp: s * exp });
  };
  nums.forEach((x) => push(simp(x), 1));
  dens.forEach((x) => push(simp(x), -1));
  if (coef === 0) return N(0);
  const top: E[] = [];
  const bot: E[] = [];
  for (const f of facs.values()) {
    if (Math.abs(f.exp) < 1e-12) continue;
    const m = Math.abs(f.exp);
    const p = m === 1 ? f.base : m === 0.5 && f.base.t !== 'f' ? fn('sqrt', f.base) : pow(f.base, N(m));
    (f.exp > 0 ? top : bot).push(p);
  }
  // letters first, brackets after: 6x(x^2 + 1)^2 rather than 6(x^2 + 1)^2 x
  const rank = (x: E): number => (x.t === 'v' || (x.t === '^' && x.b.t === 'v') ? 0 : 1);
  top.sort((a, b) => rank(a) - rank(b));
  bot.sort((a, b) => rank(a) - rank(b));
  let cn = Math.abs(coef);
  let cd = 1;
  const r = ratio(cn);
  if (r) [cn, cd] = r;
  const numE: E = top.length === 0 ? N(cn) : cn === 1 ? mul(...top) : mul(N(cn), ...top);
  const botAll = cd === 1 ? bot : [N(cd), ...bot];
  let res: E = botAll.length ? div(numE, mul(...botAll)) : numE;
  if (res.t === '/' && res.n.t === 'n' && res.d.t === 'n') res = N(res.n.v / res.d.v);
  return coef < 0 ? negate(res) : res;
}

/** Collect, cancel and fold constants so an answer reads the way a textbook would print it. */
export function simp(e: E): E {
  switch (e.t) {
    case 'n':
    case 'v':
      return e;
    case 'neg':
      return product([N(-1), e.a], []);
    case 'f': {
      const a = simp(e.a);
      if (a.t === 'n') {
        if (a.v === 0 && (e.name === 'sin' || e.name === 'tan' || e.name === 'asin' || e.name === 'atan' || e.name === 'sinh' || e.name === 'sqrt')) return N(0);
        if (a.v === 0 && (e.name === 'cos' || e.name === 'sec' || e.name === 'cosh')) return N(1);
        if (a.v === 1 && e.name === 'ln') return N(0);
        if (e.name === 'sqrt' && a.v > 0 && Number.isInteger(Math.sqrt(a.v))) return N(Math.sqrt(a.v));
        if (e.name === 'abs') return N(Math.abs(a.v));
      }
      if (e.name === 'ln' && isVar(a, 'e')) return N(1);
      if (e.name === 'ln' && a.t === '^' && isVar(a.b, 'e')) return a.e;
      return fn(e.name, a);
    }
    case 'd':
      return { ...e, a: simp(e.a) };
    case 'int':
      return { ...e, a: simp(e.a), lo: e.lo && simp(e.lo), hi: e.hi && simp(e.hi) };
    case 'lim':
      return { ...e, a: simp(e.a), to: simp(e.to) };
    case '^': {
      const b = simp(e.b);
      const x = simp(e.e);
      if (x.t === 'n') {
        if (x.v === 0) return N(1);
        if (x.v === 1) return b;
        if (b.t === 'n' && Number.isInteger(x.v) && Math.abs(x.v) <= 12) {
          const r = Math.pow(b.v, x.v);
          if (Number.isFinite(r)) return N(r);
        }
        if (b.t === '^' && b.e.t === 'n' && Number.isInteger(x.v)) return simp(pow(b.b, N(b.e.v * x.v)));
        if (x.v < 0) return product([], [x.v === -1 ? b : pow(b, N(-x.v))]);
      }
      if (isNum(b, 1)) return N(1);
      if (isVar(b, 'e') && x.t === 'f' && x.name === 'ln') return x.a;
      return pow(b, x);
    }
    case '/':
      return product([e.n], [e.d]);
    case '*':
      return product(e.a, []);
    case '+': {
      const terms = new Map<string, { term: E; coef: number }>();
      let c0 = 0;
      const push = (x: E, s: number): void => {
        if (x.t === '+') return x.a.forEach((y) => push(y, s));
        if (x.t === 'n') {
          c0 += s * x.v;
          return;
        }
        if (x.t === 'neg') return push(x.a, -s);
        let coef = 1;
        let rest: E = x;
        const lead = (y: E): [number, E] => (y.t === 'n' ? [y.v, N(1)] : y.t === '*' && y.a[0].t === 'n' ? [y.a[0].v, mul(...y.a.slice(1))] : [1, y]);
        if (x.t === '/') {
          const [cn, n] = lead(x.n);
          const [cd, dd] = lead(x.d);
          coef = cn / cd;
          rest = isNum(dd, 1) ? n : div(n, dd);
        } else [coef, rest] = lead(x);
        if (isNum(rest, 1)) {
          c0 += s * coef;
          return;
        }
        const k = toText(rest);
        const t = terms.get(k);
        if (t) t.coef += s * coef;
        else terms.set(k, { term: rest, coef: s * coef });
      };
      e.a.forEach((x) => push(simp(x), 1));
      const out: E[] = [];
      for (const t of terms.values()) {
        if (Math.abs(t.coef) < 1e-12) continue;
        out.push(t.coef === 1 ? t.term : product([N(t.coef), t.term], []));
      }
      if (c0 !== 0 || out.length === 0) out.push(N(c0));
      return out.length === 1 ? out[0] : { t: '+', a: out };
    }
  }
}

/* ───────────── writing ───────────── */

const atomic = (e: E): boolean => (e.t === 'n' && e.v >= 0 && Number.isInteger(e.v)) || e.t === 'v' || e.t === 'f';

function numStr(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
  const r = ratio(v, 720);
  if (r) return r[1] === 1 ? String(r[0]) : `${r[0]}/${r[1]}`;
  return String(Number(v.toPrecision(6)));
}

/** Linear text that parseCalc reads back to the same expression. */
export function toText(e: E): string {
  switch (e.t) {
    case 'n':
      return numStr(e.v);
    case 'v':
      return e.name;
    case 'neg': {
      const s = toText(e.a);
      return e.a.t === '+' ? `-(${s})` : `-${s}`;
    }
    case '+':
      return e.a
        .map((t, i) => {
          const [minus, body] = signOf(t);
          const s = toText(body);
          const wrapped = body.t === '+' ? `(${s})` : s;
          return i === 0 ? (minus ? `-${wrapped}` : wrapped) : `${minus ? '-' : '+'} ${wrapped}`;
        })
        .join(' ');
    case '*': {
      let out = '';
      e.a.forEach((f, i) => {
        let s = toText(f);
        if (f.t === '+' || f.t === 'neg' || (f.t === 'n' && i > 0 && f.v < 0) || (f.t === 'n' && !Number.isInteger(f.v)) || f.t === '/') s = `(${s})`;
        if (i === 0) out = s === '-1' && e.a.length > 1 ? '-' : s;
        else {
          const prev = e.a[i - 1];
          const digitNext = /^[0-9]/.test(s);
          // "7d/dx(x)" would read back as 7 · d/d · x · x, so a d/dx always gets its space
          const tight = prev.t === 'n' && !digitNext && !s.startsWith('(') && f.t !== 'd' ? '' : digitNext ? '*' : ' ';
          out += tight + s;
        }
      });
      return out;
    }
    case '/': {
      const n = toText(e.n);
      const d = toText(e.d);
      const wn = e.n.t === '+' || e.n.t === 'neg' || e.n.t === '/' ? `(${n})` : n;
      const wd = atomic(e.d) || (e.d.t === '^' && atomic(e.d.b)) ? d : `(${d})`;
      return `${wn}/${wd}`;
    }
    case '^': {
      const b = toText(e.b);
      const x = toText(e.e);
      const wb = atomic(e.b) ? b : `(${b})`;
      const wx = (e.e.t === 'n' && e.e.v >= 0 && Number.isInteger(e.e.v)) || e.e.t === 'v' ? x : `(${x})`;
      return `${wb}^${wx}`;
    }
    case 'f':
      return e.name === 'abs' ? `|${toText(e.a)}|` : `${e.name}(${toText(e.a)})`;
    case 'd':
      return `d/d${e.v}(${toText(e.a)})`;
    case 'int': {
      const body = toText(e.a);
      const lim = e.lo && e.hi ? `[${toText(e.lo)}, ${toText(e.hi)}]` : '';
      return `∫${lim} ${e.a.t === '+' || e.a.t === 'neg' ? `(${body})` : body} d${e.v}`;
    }
    case 'lim':
      return `lim ${e.v}→${toText(e.to)}${e.side === 1 ? '^+' : e.side === -1 ? '^-' : ''} (${toText(e.a)})`;
  }
}

const FN_TEX: Record<Fn, string> = { sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot', ln: '\\ln', sqrt: '\\sqrt', abs: '', asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh' };

function numTex(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '\\infty' : '-\\infty';
  const r = ratio(v, 720);
  if (r) return r[1] === 1 ? String(r[0]) : `${r[0] < 0 ? '-' : ''}\\frac{${Math.abs(r[0])}}{${r[1]}}`;
  return String(Number(v.toPrecision(6)));
}

const simpleArg = (e: E): boolean => e.t === 'v' || (e.t === 'n' && e.v >= 0) || (e.t === '*' && e.a.length === 2 && e.a[0].t === 'n' && e.a[1].t === 'v');

export function toLatex(e: E): string {
  switch (e.t) {
    case 'n':
      return numTex(e.v);
    case 'v':
      return e.name === 'pi' ? '\\pi' : e.name;
    case 'neg': {
      const s = toLatex(e.a);
      return e.a.t === '+' ? `-\\left(${s}\\right)` : `-${s}`;
    }
    case '+':
      return e.a
        .map((t, i) => {
          const [minus, body] = signOf(t);
          const s = toLatex(body);
          const wrapped = body.t === '+' ? `\\left(${s}\\right)` : s;
          return i === 0 ? (minus ? `-${wrapped}` : wrapped) : `${minus ? '-' : '+'} ${wrapped}`;
        })
        .join(' ');
    case '*': {
      let out = '';
      e.a.forEach((f, i) => {
        let s = toLatex(f);
        if (f.t === '+' || f.t === 'neg' || (f.t === 'n' && f.v < 0 && i > 0)) s = `\\left(${s}\\right)`;
        if (i === 0) out = s === '-1' && e.a.length > 1 ? '-' : s;
        else out += (/^[0-9]/.test(s) || (f.t === 'n' && e.a[i - 1].t === 'n') ? ' \\cdot ' : f.t === 'f' || f.t === 'd' || f.t === 'int' || f.t === 'lim' ? '\\,' : ' ') + s;
      });
      return out;
    }
    case '/':
      return `\\frac{${toLatex(e.n)}}{${toLatex(e.d)}}`;
    case '^': {
      if (e.b.t === 'f' && e.b.name !== 'sqrt' && e.b.name !== 'abs' && e.e.t === 'n' && e.e.v > 0) {
        const a = e.b.a;
        return `${FN_TEX[e.b.name]}^{${toLatex(e.e)}}${simpleArg(a) ? ` ${toLatex(a)}` : `\\left(${toLatex(a)}\\right)`}`;
      }
      const b = toLatex(e.b);
      const wb = atomic(e.b) && e.b.t !== 'f' ? b : `\\left(${b}\\right)`;
      return `${wb}^{${toLatex(e.e)}}`;
    }
    case 'f':
      if (e.name === 'sqrt') return `\\sqrt{${toLatex(e.a)}}`;
      if (e.name === 'abs') return `\\left|${toLatex(e.a)}\\right|`;
      return simpleArg(e.a) ? `${FN_TEX[e.name]} ${toLatex(e.a)}` : `${FN_TEX[e.name]}\\left(${toLatex(e.a)}\\right)`;
    case 'd':
      return `\\frac{d}{d${e.v}}\\left[${toLatex(e.a)}\\right]`;
    case 'int': {
      const body = toLatex(e.a);
      const lim = e.lo && e.hi ? `_{${toLatex(e.lo)}}^{${toLatex(e.hi)}}` : '';
      return `\\int${lim} ${e.a.t === '+' || e.a.t === 'neg' ? `\\left(${body}\\right)` : body}\\,d${e.v}`;
    }
    case 'lim': {
      const body = toLatex(e.a);
      return `\\lim_{${e.v} \\to ${toLatex(e.to)}${e.side === 1 ? '^{+}' : e.side === -1 ? '^{-}' : ''}} ${e.a.t === '+' || e.a.t === 'neg' ? `\\left(${body}\\right)` : body}`;
    }
  }
}

/* ───────────── comparing ───────────── */

const XS = [0.37, 0.83, 1.31, 1.9, 2.6, -0.45, -1.2, 3.3, 0.12, 4.7, -2.3, 5.9];

/** Do two expressions agree wherever both are defined? null when there aren't enough points to tell. */
export function equiv(a: E, b: E, v: string): boolean | null {
  let ok = 0;
  for (const x of XS) {
    let p: number;
    let q: number;
    try {
      p = ev(a, { [v]: x });
      q = ev(b, { [v]: x });
    } catch {
      return null;
    }
    if (!Number.isFinite(p) || !Number.isFinite(q)) continue;
    if (Math.abs(p - q) > 1e-6 * Math.max(1, Math.abs(p), Math.abs(q))) return false;
    ok++;
  }
  return ok >= 3 ? true : null;
}

/** If a = k·b for one fixed number k (and k ≠ 1), return k. */
export function constantRatio(a: E, b: E, v: string): number | null {
  let k: number | null = null;
  let ok = 0;
  for (const x of XS) {
    let p: number;
    let q: number;
    try {
      p = ev(a, { [v]: x });
      q = ev(b, { [v]: x });
    } catch {
      return null;
    }
    if (!Number.isFinite(p) || !Number.isFinite(q) || Math.abs(q) < 1e-9) continue;
    const r = p / q;
    if (k === null) k = r;
    else if (Math.abs(r - k) > 1e-6 * Math.max(1, Math.abs(k))) return null;
    ok++;
  }
  return ok >= 3 && k !== null && Math.abs(k - 1) > 1e-6 && Math.abs(k) > 1e-9 ? nice(k) : null;
}
