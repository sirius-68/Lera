import { AttemptAnalysis, CheckedLine, ConceptId, Diagnosis, Problem, ProblemKind, SolutionStep } from '../types';
import { CalcParseError, E, Flaw, Indefinite, N, V, add, constantRatio, diff, div, equiv, ev, has, mentions, mul, neg, nice, numText, parseCalc, pending, pow, pre, simp, subst, toLatex, toText } from './expr';
import { IntFlaw, integrate, integrateWith, toPoly, polyToExpr } from './integrate';
import { msg, t } from '../../i18n';
import { definiteRoute, derivativeRoute, integralRoute, limitRoute } from './route';

/**
 * Line-by-line checking for calculus.
 *
 * Every line of a derivative, an integral or a limit is another way of writing
 * the same thing, so each line is compared with the answer itself:
 *   derivative   the line must equal f′(x)
 *   integral     the line's own derivative must equal the integrand
 *   definite     the line must come to the same number
 *   limit        the line must come to the same number (or ∞, or "does not exist")
 * A d/dx, ∫ or lim that hasn't been worked out yet is allowed mid-way.
 */

export const CALC_KINDS: ProblemKind[] = ['derivative', 'integral', 'definite', 'limit'];
export const isCalc = (kind: ProblemKind): boolean => CALC_KINDS.includes(kind);

type Mode = 'derivative' | 'integral' | 'definite' | 'limit';

interface Prep {
  mode: Mode;
  v: string;
  /** f for a derivative, the integrand for integrals, the expression under the limit. */
  body: E;
  /** The whole problem as written. */
  given: E;
  /** derivative: f′ */
  target?: E;
  /** definite / limit: the value (NaN = does not exist) */
  value?: number;
  lo?: number;
  hi?: number;
  to?: number;
}

const cache = new Map<string, Prep | null>();

export function prepCalc(problem: Problem): Prep | null {
  const key = `${problem.kind}|${problem.given}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let out: Prep | null = null;
  try {
    const given = parseCalc(problem.given, problem.variable ?? 'x');
    if (given.t === 'd') out = { mode: 'derivative', v: given.v, body: given.a, given, target: simp(diff(given.a, given.v)) };
    else if (given.t === 'int' && given.lo && given.hi) {
      const lo = ev(given.lo, {});
      const hi = ev(given.hi, {});
      out = { mode: 'definite', v: given.v, body: given.a, given, lo, hi, value: ev(given, {}) };
    } else if (given.t === 'int') out = { mode: 'integral', v: given.v, body: given.a, given };
    else if (given.t === 'lim') out = { mode: 'limit', v: given.v, body: given.a, given, to: ev(given.to, {}), value: ev(given, {}) };
  } catch {
    out = null;
  }
  if (cache.size > 300) cache.clear();
  cache.set(key, out);
  return out;
}

/* ───────────── reading a line ───────────── */

const LABEL = /^(?:[a-zA-Z]\s*'{1,3}\s*(?:\(\s*[a-z]\s*\))?|d\s*[a-zA-Z]\s*\/\s*d\s*[a-z]|§[a-z]\s*[a-zA-Z](?:\s*\(\s*[a-z]\s*\))?|[a-zA-Z]\s*\(\s*[a-z]\s*\)|[yILAF])$/;
const DNE = /^(?:dne|does\s*n.?t\s+exist|does\s+not\s+exist|no\s+limit|undefined)$/i;
const DIVERGES = /^(?:diverges?|divergent)$/i;

interface Side {
  e?: E;
  special?: 'dne' | 'diverges';
  latex: string;
}

type ParsedLine = { ok: true; sides: Side[]; latex: string } | { ok: false; error: string };

function parseLine(text: string, v: string): ParsedLine {
  const chunks = pre(text).split('=').map((s) => s.trim());
  const sides: Side[] = [];
  const tex: string[] = [];
  for (const chunk of chunks) {
    if (!chunk) return { ok: false, error: t('There’s an = with nothing on one side of it.') };
    if (LABEL.test(chunk)) {
      tex.push(chunk.replace(/^d\s*([a-zA-Z])\s*\/\s*d\s*([a-z])$/, '\\frac{d$1}{d$2}').replace(/^§([a-z])\s*(.*)$/, '\\frac{d}{d$1}$2'));
      continue;
    }
    if (DNE.test(chunk)) {
      sides.push({ special: 'dne', latex: '\\text{does not exist}' });
      tex.push('\\text{does not exist}');
      continue;
    }
    if (DIVERGES.test(chunk)) {
      sides.push({ special: 'diverges', latex: '\\text{diverges}' });
      tex.push('\\text{diverges}');
      continue;
    }
    try {
      const e = parseCalc(chunk, v);
      const latex = toLatex(e);
      sides.push({ e, latex });
      tex.push(latex);
    } catch (err) {
      return { ok: false, error: err instanceof CalcParseError ? err.message : t('I couldn’t read that line.') };
    }
  }
  if (sides.length === 0) return { ok: false, error: t('Write what it equals after the = sign.') };
  return { ok: true, sides, latex: tex.join(' = ') };
}

/** LaTeX for a calculus line or problem, or null when it doesn't read as one. */
export function calcLatex(text: string): string | null {
  const p = parseLine(text, 'x');
  return p.ok ? p.latex : null;
}

/* ───────────── is this side right? ───────────── */

const closeNum = (a: number, b: number): boolean => {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= 2e-4 * Math.max(1, Math.abs(a), Math.abs(b));
};

function valueOf(s: Side): number | null {
  if (s.special === 'dne') return NaN;
  if (s.special === 'diverges') return Infinity;
  try {
    return ev(s.e as E, {});
  } catch {
    return null;
  }
}

/** true = right, false = wrong, null = can't tell. */
function truth(p: Prep, s: Side): boolean | null {
  try {
    if (p.mode === 'derivative') return s.e ? equiv(s.e, p.target as E, p.v) : false;
    if (p.mode === 'integral') return s.e ? equiv(diff(s.e, p.v), p.body, p.v) : false;
    if (p.mode === 'definite') {
      if (s.special === 'diverges') return !Number.isFinite(p.value as number);
      if (!s.e) return false;
      // an antiderivative written on its way to the numbers
      if (has(s.e, p.v)) return equiv(diff(s.e, p.v), p.body, p.v);
      const val = valueOf(s);
      return val === null ? null : closeNum(val, p.value as number);
    }
    const val = valueOf(s);
    if (val === null) return null;
    if (s.special === 'dne') return Number.isNaN(p.value as number) || !Number.isFinite(p.value as number);
    if (s.e && has(s.e, p.v)) return false;
    return closeNum(val, p.value as number);
  } catch (err) {
    if (err instanceof Indefinite) return null;
    return null;
  }
}

/** Do two sides say the same thing as each other (right or wrong)? */
function same(p: Prep, a: Side, b: Side): boolean {
  try {
    if (!a.e || !b.e) return a.special === b.special;
    if (p.mode === 'integral') return equiv(diff(a.e, p.v), diff(b.e, p.v), p.v) === true;
    if (p.mode === 'derivative' || has(a.e, p.v) || has(b.e, p.v)) return equiv(a.e, b.e, p.v) === true;
    const x = valueOf(a);
    const y = valueOf(b);
    return x !== null && y !== null && closeNum(x, y);
  } catch {
    return false;
  }
}

function finished(p: Prep, s: Side): { final: boolean; remaining?: string } {
  if (s.special) return { final: true };
  const e = s.e as E;
  if (pending(e)) {
    const what = p.mode === 'derivative' ? t('There’s still a d/dx to work out.') : p.mode === 'limit' ? t('There’s still a limit to work out.') : t('There’s still an integral to work out.');
    return { final: false, remaining: what };
  }
  if (p.mode === 'integral' && !mentions(e, 'C') && !mentions(e, 'K') && !mentions(e, 'c')) {
    return { final: false, remaining: t('Nearly. An integral without limits always ends with **+ C**, add it to finish.') };
  }
  if (p.mode === 'definite' && has(e, p.v)) return { final: false, remaining: t('That’s the antiderivative. Now put in the limits: (value at {0}) − (value at {1}).', { 0: numText(p.hi as number), 1: numText(p.lo as number) }) };
  if ((p.mode === 'definite' || p.mode === 'limit') && e.t !== 'n' && !isTidyNumber(e)) return { final: false, remaining: t('Work this out to a single number.') };
  return { final: true };
}

/** A number written the way an answer is: 8/3, -2, 2pi, sqrt(2), e^2 … but not 8/3 − 0 + 4. */
function isTidyNumber(e: E): boolean {
  if (e.t === 'n' || e.t === 'v') return true;
  if (e.t === 'neg') return isTidyNumber(e.a);
  if (e.t === '/') return isTidyNumber(e.n) && isTidyNumber(e.d);
  if (e.t === '*') return e.a.length <= 3 && e.a.every((x) => x.t === 'n' || x.t === 'v' || x.t === 'f' || x.t === '^');
  if (e.t === '^' || e.t === 'f') return true;
  return false;
}

/* ───────────── naming the mistake ───────────── */

const D_FLAWS: { flaw: Flaw; concept: ConceptId; severity: Diagnosis['severity']; title: string; message: string }[] = [
  { flaw: 'power-keep', concept: 'power-rule', severity: 'gap', title: msg('The power has to drop by one.'), message: msg('You brought the power down in front, good, but left the old power on top. The power rule has two moves: bring the power down, **then make the power one smaller**. So $x^3$ becomes $3x^2$, not $3x^3$.') },
  { flaw: 'power-nocoef', concept: 'power-rule', severity: 'gap', title: msg('The old power comes down in front.'), message: msg('You made the power one smaller, good, but forgot to **bring the old power down as a multiplier** first. So $x^3$ becomes $3x^2$, not $x^2$.') },
  { flaw: 'const-kept', concept: 'power-rule', severity: 'gap', title: 'A number on its own turns into 0.', message: 'A derivative measures how fast something changes. A plain number never changes, so its derivative is **0**, it simply disappears from the answer.' },
  { flaw: 'product-naive', concept: 'product-rule', severity: 'gap', title: msg('Two things multiplied need the product rule.'), message: msg('You differentiated each part and multiplied the results. That feels natural, but it isn’t how products work. Use: **(first)′ × second + first × (second)′**. Each part takes one turn being differentiated while the other waits.') },
  { flaw: 'product-first', concept: 'product-rule', severity: 'gap', title: msg('Half of the product rule is missing.'), message: msg('You differentiated the first part and kept the second, that is only half. Add the other half too: **first × (second)′**.') },
  { flaw: 'quotient-naive', concept: 'quotient-rule', severity: 'gap', title: 'A fraction needs the quotient rule.', message: msg('You differentiated the top and the bottom separately. For a fraction use: **(top′ × bottom − top × bottom′) ÷ bottom²**.') },
  { flaw: 'quotient-sign', concept: 'quotient-rule', severity: 'slip', title: msg('The quotient rule is the right way round… backwards.'), message: msg('The two halves on top are swapped, which flips the sign. It always starts with **top′ × bottom**, then subtracts **top × bottom′**. (“Low d-high minus high d-low.”)') },
  { flaw: 'quotient-nosquare', concept: 'quotient-rule', severity: 'slip', title: msg('The bottom gets squared.'), message: msg('The top of your answer is right. In the quotient rule the bottom is **squared**: divide by bottom², not just bottom.') },
  { flaw: 'chain-missing', concept: 'chain-rule', severity: 'gap', title: msg('Multiply by the derivative of the inside.'), message: msg('There is a function inside another function here. You differentiated the outside, good, but then you must **multiply by the derivative of the inside**. That extra step is the chain rule.') },
  { flaw: 'trig-sign', concept: 'trig-derivatives', severity: 'slip', title: msg('Check the sign on that trig derivative.'), message: msg('The derivative of $sin(x)$ is $cos(x)$, no minus. The derivative of $cos(x)$ is $-sin(x)$, with a minus. Only **cos picks up the minus sign**.') },
  { flaw: 'exp-power', concept: 'exp-log-derivatives', severity: 'gap', title: msg('The power rule doesn’t work when x is in the power.'), message: msg('The power rule is for $x^n$, x at the bottom, a number on top. Here x is **in the power**. For $e^x$ the derivative is just $e^x$ again (times the derivative of the power, if the power is more than plain x).') },
];

const I_FLAWS: { flaw: IntFlaw; concept: ConceptId; severity: Diagnosis['severity']; title: string; message: string }[] = [
  { flaw: 'no-divide', concept: 'antiderivatives', severity: 'gap', title: msg('Divide by the new power.'), message: msg('You added 1 to the power, good. The second move is to **divide by that new power**. So $∫ x^2 dx$ is $x^3/3$, not $x^3$. Check: differentiate $x^3/3$ and you get $x^2$ back.') },
  { flaw: 'divide-old', concept: 'antiderivatives', severity: 'slip', title: msg('Divide by the new power, not the old one.'), message: msg('Add 1 to the power first, **then** divide by the number you just made. For $x^2$: the new power is 3, so divide by 3.') },
  { flaw: 'trig-sign', concept: 'antiderivatives', severity: 'slip', title: msg('The sign on that trig integral is flipped.'), message: msg('Integrating runs the derivative table backwards: $∫ cos(x) dx = sin(x)$ (no minus) and $∫ sin(x) dx = -cos(x)$ (with a minus). Differentiate your answer to check it.') },
  { flaw: 'inner-ignored', concept: 'u-substitution', severity: 'gap', title: msg('The inside needs dealing with too.'), message: msg('There is something more than plain x inside. When you integrate the outside you have to **divide by the derivative of the inside** (that’s what substitution does). Check: differentiate your answer, the chain rule gives an extra number you didn’t want.') },
];

const fixText = (p: Prep): string | undefined => {
  if (p.mode === 'derivative') return toText(p.target as E);
  if (p.mode === 'integral') {
    const F = integrate(p.body, p.v);
    return F ? `${toText(F.F)} + C` : undefined;
  }
  return numText(p.value as number);
};

const unknown = (p: Prep, problem: Problem, message: string): Diagnosis => ({
  code: 'unknown',
  concept: problem.concepts[0] ?? (p.mode === 'derivative' ? 'power-rule' : p.mode === 'limit' ? 'limits' : p.mode === 'definite' ? 'definite-integrals' : 'antiderivatives'),
  severity: 'slip',
  title: t('This line doesn’t match.'),
  message,
  fix: fixText(p),
});

function diagnose(p: Prep, problem: Problem, s: Side): Diagnosis {
  const v = p.v;
  const fix = fixText(p);
  const e = s.e;
  try {
    if (p.mode === 'derivative' && e) {
      const T = p.target as E;
      for (const f of D_FLAWS) {
        const used = { hit: false };
        const wrong = diff(p.body, v, f.flaw, used);
        if (used.hit && equiv(wrong, T, v) === false && equiv(e, wrong, v) === true) return { code: f.flaw, concept: f.concept, severity: f.severity, title: f.title, message: f.message, fix };
      }
      if (equiv(e, p.body, v) === true) return { code: 'not-differentiated', concept: problem.concepts[0] ?? 'power-rule', severity: 'notation', title: t('That’s still the original function.'), message: t('This line equals the function you started with, nothing has been differentiated yet.'), fix };
      if (equiv(e, neg(T), v) === true) return { code: 'sign-flip', concept: 'signed-arithmetic', severity: 'slip', title: t('Everything is right except the sign.'), message: t('Your answer is the exact opposite of the derivative, a minus sign was dropped or added somewhere. Trace the signs through each step.'), fix };
      if (equiv(diff(e, v), p.body, v) === true) return { code: 'integrated-instead', concept: problem.concepts[0] ?? 'power-rule', severity: 'gap', title: t('That’s the integral, not the derivative.'), message: t('You went the wrong direction: you raised the power and divided. Differentiating does the opposite, **bring the power down, then lower it by one**.'), fix };
      const k = constantRatio(e, T, v);
      if (k !== null) return { code: 'coefficient', concept: 'arithmetic', severity: 'slip', title: t('Right shape, wrong number in front.'), message: t('The x-part of your answer is right, but the number in front is off by a factor of {0}. Redo the multiplying.', { 0: numText(k) }), fix };
      return unknown(p, problem, t('This isn’t the derivative. Go through it one piece at a time and check which rule each piece needs: power, product, quotient or chain.'));
    }
    if (p.mode === 'integral' && e) {
      for (const f of I_FLAWS) {
        const wrong = integrateWith(p.body, v, f.flaw);
        if (wrong && equiv(diff(wrong, v), p.body, v) === false && equiv(diff(e, v), diff(wrong, v), v) === true) return { code: `int-${f.flaw}`, concept: f.concept, severity: f.severity, title: f.title, message: f.message, fix };
      }
      if (equiv(e, diff(p.body, v), v) === true) return { code: 'differentiated-instead', concept: 'antiderivatives', severity: 'gap', title: t('That’s the derivative, not the integral.'), message: t('You went the wrong direction. Integrating is differentiating **backwards**: add 1 to the power, then divide by the new power.'), fix };
      if (equiv(diff(e, v), neg(p.body), v) === true) return { code: 'sign-flip', concept: 'signed-arithmetic', severity: 'slip', title: t('Everything is right except the sign.'), message: t('Differentiate your answer and you get the integrand with the opposite sign. One minus sign is wrong.'), fix };
      const k = constantRatio(diff(e, v), p.body, v);
      if (k !== null) return { code: 'int-coefficient', concept: 'antiderivatives', severity: 'slip', title: t('Right shape, wrong number in front.'), message: t('Here’s a check that always works: **differentiate your answer**, you should get back exactly what was inside the integral. Yours comes back {0} times that, so the number in front needs fixing.', { 0: numText(k) }), fix };
      return unknown(p, problem, t('Differentiate your answer: you should get back exactly what is inside the integral. Here you don’t, so one of the terms has gone wrong.'));
    }
    if (p.mode === 'definite') {
      const val = valueOf(s);
      const N0 = p.value as number;
      const F = integrate(p.body, v);
      if (val !== null && Number.isFinite(val)) {
        if (closeNum(val, -N0) && Math.abs(N0) > 1e-9) return { code: 'limits-swapped', concept: 'definite-integrals', severity: 'slip', title: t('Top limit first, then subtract the bottom.'), message: t('Your number is right but the sign is flipped. It is always **(value at the top limit) − (value at the bottom limit)**, in that order.'), fix };
        if (F) {
          const at = (x: number): number => ev(F.F, { [v]: x });
          const top = at(p.hi as number);
          const bottom = at(p.lo as number);
          if (closeNum(val, top) && Math.abs(bottom) > 1e-9) return { code: 'forgot-lower', concept: 'definite-integrals', severity: 'gap', title: t('Subtract the value at the bottom limit.'), message: t('You put the top limit in, good, and stopped. You also have to put the bottom limit in and **subtract** it.'), fix };
          if (closeNum(val, top + bottom) && Math.abs(bottom) > 1e-9) return { code: 'added-limits', concept: 'definite-integrals', severity: 'slip', title: t('Subtract, don’t add.'), message: t('You worked out both ends correctly, then added them. A definite integral is **top minus bottom**.'), fix };
        }
        const g = (x: number): number => ev(p.body, { [v]: x });
        if (closeNum(val, g(p.hi as number) - g(p.lo as number))) return { code: 'not-integrated', concept: 'definite-integrals', severity: 'gap', title: t('Integrate first, then put the limits in.'), message: t('You put the limits straight into the function. First find the **antiderivative**, and put the limits into *that*.'), fix };
      }
      if (e && has(e, v)) return diagnose({ ...p, mode: 'integral' }, problem, s);
      return unknown(p, problem, t('That number doesn’t match. Do it in two stages: find the antiderivative, then work out (value at the top limit) − (value at the bottom limit).'));
    }
    if (p.mode === 'limit') {
      const val = valueOf(s);
      const L = p.value as number;
      const to = p.to as number;
      let plug = NaN;
      let zeroOverZero = false;
      if (Number.isFinite(to)) {
        try {
          plug = ev(p.body, { [v]: to });
          if (p.body.t === '/') zeroOverZero = Math.abs(ev(p.body.n, { [v]: to })) < 1e-9 && Math.abs(ev(p.body.d, { [v]: to })) < 1e-9;
        } catch {
          plug = NaN;
        }
      }
      if (zeroOverZero && (val === 0 || s.special === 'dne' || (val !== null && !Number.isFinite(val)))) {
        return { code: 'zero-over-zero', concept: 'limits', severity: 'gap', title: '0/0 is a signal, not an answer.', message: t('Putting ${0} = {1}$ straight in gives 0 on top and 0 underneath. That doesn’t mean “0” or “no limit”, it means **there is a common factor hiding**. Factor the top and bottom, cancel it, then substitute.', { 0: v, 1: numText(to) }), fix };
      }
      if (!Number.isFinite(to) && val !== null && Number.isFinite(L) && (val === 0 || !Number.isFinite(val))) {
        return { code: 'infinity-compare', concept: 'limits', severity: 'gap', title: t('Compare the biggest powers.'), message: t('When x gets huge, only the **highest power** on the top and on the bottom matters, everything else is small change. Divide their coefficients.'), fix };
      }
      if (val !== null && Number.isFinite(plug) && !closeNum(plug, L) && closeNum(val, plug)) {
        return { code: 'plugged-in', concept: 'limits', severity: 'gap', title: 'A limit is where it’s heading, not where it is.', message: t('You used the value **at** the point. A limit asks what the expression gets close to as x gets *near* the point, and here those are different.'), fix };
      }
      return unknown(p, problem, t('That isn’t what this expression heads towards as ${0}$ gets close to {1}. Try a few values very near {2} and watch where the results go.', { 0: v, 1: numText(to), 2: numText(to) }));
    }
  } catch {
    /* fall through */
  }
  return unknown(p, problem, t('This line doesn’t follow. Check it against the line above.'));
}

/* ───────────── the whole attempt ───────────── */

export function calcAnalyze(problem: Problem, rawLines: string[]): AttemptAnalysis {
  const texts = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  const p = prepCalc(problem);
  if (!p) return { lines: texts.map((text) => ({ text, status: 'unchecked' as const })), verdict: texts.length ? 'unfinished' : 'empty', marks: [], steps: texts.length, cleanSteps: 0 };

  const lines: CheckedLine[] = [];
  let prevGood = true;
  let prevSide: Side | null = null;
  let lastState: { good: boolean; final: boolean; remaining?: string } | null = null;

  for (const text of texts) {
    const parsed = parseLine(text, p.v);
    if (!parsed.ok) {
      lines.push({ text, status: 'unreadable', note: parsed.error });
      continue;
    }
    const verdicts = parsed.sides.map((s) => truth(p, s));
    const bad = parsed.sides.find((_, i) => verdicts[i] === false);
    const last = parsed.sides[parsed.sides.length - 1];
    if (!bad && verdicts.some((x) => x === null)) {
      lines.push({ text, status: 'unchecked', latex: parsed.latex, note: t('I can’t compare this line, so I’ve left it unmarked.') });
      continue;
    }
    if (!bad) {
      const fin = finished(p, last);
      lines.push({ text, status: prevGood ? 'ok' : 'recovered', latex: parsed.latex, trueToGiven: true, isFinal: fin.final, note: fin.final ? undefined : undefined });
      lastState = { good: true, ...fin };
      prevGood = true;
    } else {
      const carried = !prevGood && prevSide !== null && same(p, prevSide, parsed.sides[0]) && parsed.sides.every((s) => same(p, s, parsed.sides[0]));
      if (carried) lines.push({ text, status: 'carried', latex: parsed.latex, trueToGiven: false });
      else lines.push({ text, status: 'wrong', latex: parsed.latex, trueToGiven: false, diag: diagnose(p, problem, bad) });
      lastState = { good: false, final: false };
      prevGood = false;
    }
    prevSide = last;
  }

  let verdict: AttemptAnalysis['verdict'] = 'empty';
  let remaining: string | undefined;
  if (lastState) {
    if (!lastState.good) verdict = 'wrong';
    else if (lastState.final) verdict = 'solved';
    else {
      verdict = 'unfinished';
      remaining = lastState.remaining;
    }
  } else if (lines.length) verdict = 'unfinished';

  const marks: Diagnosis[] = lines.filter((l) => l.status === 'wrong' && l.diag).map((l) => l.diag as Diagnosis);
  const checked = lines.filter((l) => l.status !== 'unreadable' && l.status !== 'unchecked').length;
  return { lines, verdict, marks, approach: approachOf(p), steps: checked, cleanSteps: calcPath(problem).length, remaining };
}

/* ───────────── worked routes and hints ───────────── */

type Shape = 'sum' | 'product' | 'quotient' | 'chain' | 'basic';

function shapeOf(f: E, v: string): { shape: Shape; core: E } {
  let core = f;
  // constants in front don't change which rule is needed
  while (core.t === '*' && core.a.filter((x) => has(x, v)).length === 1) core = core.a.find((x) => has(x, v)) as E;
  if (core.t === 'neg') return shapeOf(core.a, v);
  if (core.t === '+') return { shape: 'sum', core };
  if (core.t === '*') return { shape: 'product', core };
  if (core.t === '/' && has(core.d, v)) return has(core.n, v) ? { shape: 'quotient', core } : { shape: 'chain', core };
  if (core.t === 'f' && !(core.a.t === 'v')) return { shape: 'chain', core };
  if (core.t === '^' && ((has(core.b, v) && core.b.t !== 'v') || (has(core.e, v) && core.e.t !== 'v'))) return { shape: 'chain', core };
  return { shape: 'basic', core };
}

function approachOf(p: Prep): string | undefined {
  if (p.mode === 'derivative') {
    const s = shapeOf(p.body, p.v).shape;
    return s === 'product' ? t('product rule') : s === 'quotient' ? t('quotient rule') : s === 'chain' ? t('chain rule') : t('power rule');
  }
  if (p.mode === 'integral' || p.mode === 'definite') {
    const F = integrate(p.body, p.v);
    if (!F) return undefined;
    return F.how === 'usub' || F.how === 'linear' ? 'substitution' : F.how === 'parts' ? 'integration by parts' : 'reverse power rule';
  }
  return 'limit';
}

const D = (e: E, v: string): E => ({ t: 'd', a: e, v });

function derivativeSteps(p: Prep): SolutionStep[] {
  const v = p.v;
  const { shape, core } = shapeOf(p.body, v);
  const final = toText(p.target as E);
  const steps: SolutionStep[] = [];
  const outsideConst = (inner: E): E => {
    // rebuild the original with `inner` in place of the core, so constants in front are kept
    const swap = (x: E): E => (x === core ? inner : x.t === '*' ? { t: '*', a: x.a.map(swap) } : x.t === 'neg' ? neg(swap(x.a)) : x);
    return swap(p.body);
  };
  if (shape === 'product' && core.t === '*') {
    const parts = core.a.filter((x) => has(x, v));
    const consts = core.a.filter((x) => !has(x, v));
    const u = parts[0];
    const w = mul(...parts.slice(1));
    const line = add(mul(D(u, v), w), mul(u, D(w, v)));
    steps.push({ tag: 'calc', line: toText(outsideConst(consts.length ? mul(...consts, line) : line)), why: t('Two things multiplied → **product rule**: (first)′ × second + first × (second)′. Each part takes a turn being differentiated while the other one waits.') });
    steps.push({ tag: 'final', line: final, why: t('Now do the two small derivatives one at a time, write them in, and collect what can be collected.') });
  } else if (shape === 'quotient' && core.t === '/') {
    const line = div(add(mul(D(core.n, v), core.d), neg(mul(core.n, D(core.d, v)))), pow(core.d, N(2)));
    steps.push({ tag: 'calc', line: toText(outsideConst(line)), why: 'A fraction → **quotient rule**: (top′ × bottom − top × bottom′) ÷ bottom². Always start with the top’s derivative.' });
    steps.push({ tag: 'final', line: final, why: t('Work out the two small derivatives, then tidy the top.') });
  } else if (shape === 'chain') {
    let inner: E | null = null;
    if (core.t === 'f') inner = core.a;
    else if (core.t === '^') inner = has(core.b, v) && core.b.t !== 'v' ? core.b : core.e;
    else if (core.t === '/') inner = core.d;
    if (inner) {
      // differentiate the outside with the inside held as a block
      const blockName = '§';
      const asBlock = replaceNode(core, inner, V(blockName));
      const dOuter = subst(simp(diff(asBlock, blockName)), blockName, inner);
      steps.push({ tag: 'calc', line: toText(outsideConst(mul(dOuter, D(inner, v)))), why: `A function inside a function → **chain rule**. Treat $${toText(inner)}$ as one block: differentiate the outside and leave the block alone, then multiply by the derivative of the block.` });
    }
    steps.push({ tag: 'final', line: final, why: t('Work out the derivative of the inside block, then multiply everything together.') });
  } else if (shape === 'sum') {
    steps.push({ tag: 'final', line: final, why: t('Go **one term at a time**. For each power of x: bring the power down in front, then make the power one smaller. A number on its own becomes 0.') });
  } else {
    steps.push({ tag: 'final', line: final, why: basicWhy(core) });
  }
  return steps;
}

function replaceNode(e: E, target: E, by: E): E {
  if (e === target) return by;
  const r = (x: E): E => replaceNode(x, target, by);
  switch (e.t) {
    case '+':
    case '*':
      return { t: e.t, a: e.a.map(r) };
    case '/':
      return div(r(e.n), r(e.d));
    case '^':
      return pow(r(e.b), r(e.e));
    case 'neg':
      return neg(r(e.a));
    case 'f':
      return { ...e, a: r(e.a) };
    default:
      return e;
  }
}

function basicWhy(core: E): string {
  if (core.t === '^' && core.e.t === 'n') return '**Power rule**: bring the power down in front, then make the power one smaller.';
  if (core.t === '^') return t('For $e^x$ the derivative is $e^x$ again, it is the one function that is its own derivative.');
  if (core.t === 'f') {
    const facts: Record<string, string> = { sin: t('The derivative of sin is cos.'), cos: t('The derivative of cos is −sin (cos picks up a minus).'), tan: t('The derivative of tan is sec².'), ln: t('The derivative of ln x is 1/x.'), sqrt: '√x is x to the power ½, so the power rule gives 1/(2√x).' };
    return facts[core.name] ?? t('This one comes straight from the table of standard derivatives.');
  }
  return t('The derivative of x is 1; a number in front just stays in front.');
}

function integralSteps(p: Prep): SolutionStep[] {
  const F = integrate(p.body, p.v);
  if (!F) return [];
  const why =
    F.how === 'parts'
      ? t('This is a product that won’t untangle, so use **integration by parts**: ∫u dv = uv − ∫v du. Choose u = ${0}$ because it gets simpler when you differentiate it.', { 0: F.u ? toText(F.u) : 'the polynomial' })
      : F.how === 'usub'
        ? t('Spot the inside: let u = ${0}$. Its derivative is sitting right there in the problem, so everything turns into a simple integral in u. Integrate that, then put the inside back.', { 0: F.u ? toText(F.u) : 'the inside' })
        : F.how === 'linear'
          ? t('The inside is a straight line (a number times x, plus a number). Integrate the outside as normal, then **divide by the number in front of x**.')
          : F.how === 'table'
            ? t('These come from running the derivative table backwards: ∫cos = sin, ∫sin = −cos, ∫eˣ = eˣ, ∫1/x = ln|x|.')
            : '**Power rule backwards**: add 1 to the power, then divide by the new power. Do it to each term.';
  return [{ tag: 'final', line: `${toText(F.F)} + C`, why: `${why} Finish with **+ C**, because any constant disappears when you differentiate.` }];
}

function definiteSteps(p: Prep): SolutionStep[] {
  const F = integrate(p.body, p.v);
  const value = numText(p.value as number);
  if (!F || !Number.isFinite(p.lo as number) || !Number.isFinite(p.hi as number)) {
    return [{ tag: 'final', line: value, why: t('Find the antiderivative, then work out (value at the top limit) − (value at the bottom limit).') }];
  }
  const top = nice(ev(F.F, { [p.v]: p.hi as number }));
  const bottom = nice(ev(F.F, { [p.v]: p.lo as number }));
  const wrap = (x: number): string => (x < 0 ? `(${numText(x)})` : numText(x));
  const steps: SolutionStep[] = [{ tag: 'calc', line: toText(F.F), why: t('First find the antiderivative, forget the limits for a moment. (No + C needed: it would cancel in the next step.)') }];
  if (Number.isFinite(top) && Number.isFinite(bottom)) steps.push({ tag: 'calc', line: `${numText(top)} - ${wrap(bottom)}`, why: t('Put the top limit ({0}) in, then subtract what you get from the bottom limit ({1}). **Top minus bottom**, never the other way round.', { 0: numText(p.hi as number), 1: numText(p.lo as number) }) });
  steps.push({ tag: 'final', line: value, why: t('Do the subtraction. The answer to a definite integral is one number.') });
  return steps;
}

function limitSteps(p: Prep): SolutionStep[] {
  const v = p.v;
  const to = p.to as number;
  const L = p.value as number;
  const answer = numText(L);
  if (!Number.isFinite(to)) {
    const rational = p.body.t === '/' && toPoly(p.body.n, v) && toPoly(p.body.d, v);
    return [{ tag: 'final', line: answer, why: rational ? t('When x is enormous, only the **highest power** on the top and on the bottom matters. Compare those two terms: same power → divide their coefficients; bigger power underneath → 0; bigger power on top → ∞.') : t('Ask what each piece does as x grows without end, then combine them.') }];
  }
  let plug = NaN;
  try {
    plug = ev(p.body, { [v]: to });
  } catch {
    plug = NaN;
  }
  if (Number.isFinite(plug) && Number.isFinite(L) && Math.abs(plug - L) < 1e-6 * Math.max(1, Math.abs(L))) {
    return [{ tag: 'final', line: answer, why: t('Nothing breaks when you put ${0} = {1}$ straight in (no dividing by zero), so just substitute.', { 0: v, 1: numText(to) }) }];
  }
  const steps: SolutionStep[] = [];
  if (p.body.t === '/') {
    const n = toPoly(p.body.n, v);
    const d = toPoly(p.body.d, v);
    if (n && d) {
      // cancel the shared factor (x − a) as many times as it divides both
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
      let nn: number[] | null = n;
      let dd: number[] | null = d;
      let did = false;
      for (let i = 0; i < 4; i++) {
        const a: number[] | null = deflate(nn);
        const b: number[] | null = deflate(dd);
        if (!a || !b || b.length === 0) break;
        nn = a;
        dd = b;
        did = true;
      }
      if (did) {
        const reduced = simp(div(polyToExpr(nn, v), polyToExpr(dd, v)));
        steps.push({ tag: 'calc', line: `lim ${v}→${numText(to)} (${toText(reduced)})`, why: t('Putting ${0} = {1}$ in gives 0/0. That is a signal that top and bottom share the factor $({2})$. Factor it out of both and cancel.', { 0: v, 1: numText(to), 2: toText(simp(add(V(v), N(-to)))) }) });
        steps.push({ tag: 'final', line: answer, why: t('The factor that caused the 0/0 is gone, so nothing breaks now. Put ${0} = {1}$ into what is left and work it out.', { 0: v, 1: numText(to) }) });
        return steps;
      }
    }
    let zz = false;
    try {
      zz = Math.abs(ev(p.body.n, { [v]: to })) < 1e-9 && Math.abs(ev(p.body.d, { [v]: to })) < 1e-9;
    } catch {
      zz = false;
    }
    if (zz) {
      const lh = simp(div(diff(p.body.n, v), diff(p.body.d, v)));
      steps.push({ tag: 'calc', line: `lim ${v}→${numText(to)} (${toText(lh)})`, why: t('Substituting gives 0/0. **L’Hôpital’s rule**: differentiate the top and the bottom separately (not as a quotient), then try the limit again.') });
      steps.push({ tag: 'final', line: answer, why: t('Now put ${0} = {1}$ into the new top and bottom. This time it gives a real number.', { 0: v, 1: numText(to) }) });
      return steps;
    }
  }
  return [{ tag: 'final', line: answer, why: Number.isNaN(L) ? t('From the left and from the right the expression heads to different places, so there is no single limit.') : t('Look at what the expression gets close to as ${0}$ gets near {1} from both sides.', { 0: v, 1: numText(to) }) }];
}

const pathCache = new Map<string, SolutionStep[]>();

export function calcPath(problem: Problem): SolutionStep[] {
  const key = `${problem.kind}|${problem.given}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  const p = prepCalc(problem);
  let steps: SolutionStep[] = [];
  if (p) {
    try {
      // the detailed route first; the short one only where the detailed one can't be built
      const detailed =
        p.mode === 'derivative' ? derivativeRoute(p.body, p.v) : p.mode === 'integral' ? integralRoute(p.body, p.v) : p.mode === 'definite' ? definiteRoute(p.body, p.v, p.lo as number, p.hi as number, p.value as number) : limitRoute(p.body, p.v, p.to as number, p.value as number);
      steps = detailed ?? (p.mode === 'derivative' ? derivativeSteps(p) : p.mode === 'integral' ? integralSteps(p) : p.mode === 'definite' ? definiteSteps(p) : limitSteps(p));
    } catch {
      steps = [];
    }
  }
  if (pathCache.size > 300) pathCache.clear();
  pathCache.set(key, steps);
  return steps;
}

const NUDGES: Record<Mode, Record<string, string>> = {
  derivative: {
    product: msg('Two things are multiplied together. Which rule handles a product?'),
    quotient: msg('This is one thing divided by another. Which rule handles a fraction?'),
    chain: msg('There’s a function hiding inside another function. What do you do with the inside?'),
    sum: msg('Take it one term at a time. What happens to a power of x when you differentiate it?'),
    basic: msg('Is this a power of x, or one from the table (sin, cos, eˣ, ln)?'),
  },
  integral: { any: msg('Think backwards: what could you differentiate to get this?') },
  definite: { any: msg('Two stages: first the antiderivative, then the limits. Which comes first?') },
  limit: { any: msg('What happens if you put the number straight in? If something breaks, what could you cancel?') },
};

export interface CalcHint {
  nudge: string;
  method: string;
  line: string;
  concept?: ConceptId;
}

/** Help from wherever the student has got to: the first step of the clean route they haven't matched yet. */
export function calcHint(problem: Problem, rawLines: string[]): CalcHint | null {
  const p = prepCalc(problem);
  if (!p) return null;
  const path = calcPath(problem);
  if (!path.length) return null;
  const a = calcAnalyze(problem, rawLines);
  const trueLines = a.lines.filter((l) => l.status === 'ok' || l.status === 'recovered');
  const good = trueLines.length;
  const step = path[nextIndex(path, trueLines[trueLines.length - 1]?.text, good, p.v)];
  const shape = p.mode === 'derivative' ? shapeOf(p.body, p.v).shape : 'any';
  const nudge = a.remaining && good > 0 ? a.remaining : NUDGES[p.mode][shape] ?? NUDGES[p.mode].any ?? '';
  return { nudge, method: step.why, line: step.line, concept: problem.concepts[0] };
}

/**
 * Where the learner is on the route: just after the route line their last true line matches, or, when it matches
 * none, as far along as the number of true lines they have written. Side working that leads into a step comes first.
 */
function nextIndex(path: SolutionStep[], last: string | undefined, good: number, v: string): number {
  const canon = (text: string): string => {
    const r = parseLine(text, v);
    return (r.ok ? r.latex : text).replace(/\s+/g, '');
  };
  if (last) {
    const mine = canon(last);
    for (let i = path.length - 1; i >= 0; i--) if (!path[i].aside && canon(path[i].line) === mine) return Math.min(path.length - 1, i + 1);
  }
  const main = path.map((s, i) => (s.aside ? -1 : i)).filter((i) => i >= 0);
  if (!main.length) return path.length - 1;
  let at = main[Math.min(main.length - 1, good)];
  while (at > 0 && path[at - 1].aside) at--;
  return at;
}

/** Which calculus idea a problem mostly exercises — used when notes don't say. */
export function conceptsOfCalc(problem: Pick<Problem, 'kind' | 'given' | 'variable'>): ConceptId[] {
  const p = prepCalc({ ...problem, id: '', prompt: '', concepts: [], source: 'notes' } as Problem);
  if (!p) return [];
  if (p.mode === 'limit') return ['limits'];
  if (p.mode === 'derivative') {
    const s = shapeOf(p.body, p.v).shape;
    const text = toText(p.body);
    const extra: ConceptId[] = /sin|cos|tan|sec/.test(text) ? ['trig-derivatives'] : /e\^|ln/.test(text) ? ['exp-log-derivatives'] : [];
    const main: ConceptId = s === 'product' ? 'product-rule' : s === 'quotient' ? 'quotient-rule' : s === 'chain' ? 'chain-rule' : 'power-rule';
    return [main, ...extra.filter((x) => x !== main)].slice(0, 2);
  }
  const F = integrate(p.body, p.v);
  const how: ConceptId = !F ? 'antiderivatives' : F.how === 'parts' ? 'integration-by-parts' : F.how === 'usub' || F.how === 'linear' ? 'u-substitution' : 'antiderivatives';
  return p.mode === 'definite' ? ['definite-integrals', how] : [how, 'constant-of-integration'];
}

/** The answer as text, for "show solution". */
export function calcAnswer(problem: Problem): string | null {
  const path = calcPath(problem);
  return path.length ? path[path.length - 1].line : null;
}
