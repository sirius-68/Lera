import { ConceptId, Problem, ProblemKind } from './types';

/** Small seeded RNG so a session can be rebuilt identically. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type R = () => number;
const int = (r: R, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: R, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const nz = (r: R, lo: number, hi: number): number => {
  let v = 0;
  while (v === 0) v = int(r, lo, hi);
  return v;
};
/** "+ 3" / "- 3" */
const plus = (n: number): string => (n < 0 ? `- ${-n}` : `+ ${n}`);
/** coefficient in front of a letter: 1 → "", -1 → "-" */
const co = (n: number): string => (n === 1 ? '' : n === -1 ? '-' : String(n));

export const PROMPTS: Record<ProblemKind, string> = {
  linear: 'Solve for x',
  quadratic: 'Solve for x',
  equation: 'Solve for x',
  inequality: 'Solve the inequality',
  simplify: 'Simplify',
  expand: 'Expand and simplify',
  factor: 'Factorise',
  evaluate: 'Work out',
  system: 'Solve the system',
  derivative: 'Differentiate',
  integral: 'Integrate',
  definite: 'Evaluate the integral',
  limit: 'Find the limit',
  open: 'Work through this',
};

interface Draft {
  kind: ProblemKind;
  given: string;
  prompt?: string;
  subs?: Record<string, string>;
  level?: 1 | 2 | 3;
}

/** Each concept can produce problems that exercise exactly that idea. */
const ALGEBRA_MAKERS: Partial<Record<ConceptId, ((r: R) => Draft)[]>> = {
  'inverse-operations': [
    (r) => {
      const x = nz(r, -9, 9);
      const a = int(r, 2, 12);
      return { kind: 'linear', given: `x ${plus(a)} = ${x + a}`, level: 1 };
    },
    (r) => {
      const x = nz(r, -9, 9);
      const a = int(r, 2, 6);
      const b = nz(r, -9, 9);
      return { kind: 'linear', given: `${a}x ${plus(b)} = ${a * x + b}`, level: 1 };
    },
    (r) => {
      const x = nz(r, -8, 8);
      const a = int(r, 3, 7);
      const c = int(r, 1, a - 1);
      const b = nz(r, -9, 9);
      return { kind: 'linear', given: `${a}x ${plus(b)} = ${co(c)}x ${plus((a - c) * x + b)}`, level: 2 };
    },
  ],
  balance: [
    (r) => {
      const x = nz(r, -9, 9);
      const a = int(r, 2, 9);
      return { kind: 'linear', given: `${a}x = ${a * x}`, level: 1 };
    },
    (r) => {
      const x = nz(r, -6, 6);
      const a = pick(r, [2, 3, 4, 5]);
      const b = a * int(r, 1, 4);
      return { kind: 'linear', given: `${a}x ${plus(b)} = ${a * x + b}`, level: 1 };
    },
    (r) => {
      const a = int(r, 2, 6);
      const x = a * nz(r, -5, 5);
      return { kind: 'linear', given: `x/${a} = ${x / a}`, level: 1 };
    },
  ],
  distributive: [
    (r) => ({ kind: 'expand', given: `${int(r, 2, 6)}(x ${plus(nz(r, -7, 7))})`, level: 1 }),
    (r) => ({ kind: 'expand', given: `-${int(r, 2, 5)}(x ${plus(nz(r, -7, 7))})`, level: 2 }),
    (r) => {
      const a = int(r, 2, 5);
      const b = nz(r, -6, 6);
      const x = nz(r, -6, 6);
      return { kind: 'linear', given: `${a}(x ${plus(b)}) = ${a * (x + b)}`, level: 2 };
    },
    (r) => {
      const a = int(r, 2, 5);
      const b = int(r, 2, 4);
      return { kind: 'simplify', given: `${a}(x ${plus(nz(r, -5, 5))}) - ${b}(x ${plus(nz(r, -5, 5))})`, level: 3 };
    },
  ],
  'like-terms': [
    (r) => ({ kind: 'simplify', given: `${int(r, 2, 7)}x ${plus(nz(r, -9, 9))} ${plus(int(r, 2, 6))}x ${plus(nz(r, -9, 9))}`, level: 1 }),
    (r) => ({ kind: 'simplify', given: `${int(r, 2, 6)}x^2 ${plus(nz(r, -6, 6))}x ${plus(nz(r, -5, 5))}x^2 ${plus(nz(r, -6, 6))}x`, level: 2 }),
    (r) => ({ kind: 'simplify', given: `${int(r, 2, 6)}x ${plus(int(r, 2, 6))}y ${plus(nz(r, -5, 5))}x ${plus(nz(r, -5, 5))}y`, level: 2 }),
  ],
  'signed-arithmetic': [
    (r) => ({ kind: 'evaluate', given: `-${int(r, 2, 9)} - ${int(r, 2, 9)}`, level: 1 }),
    (r) => ({ kind: 'evaluate', given: `${int(r, 2, 9)} - (-${int(r, 2, 9)})`, level: 1 }),
    (r) => ({ kind: 'evaluate', given: `(-${int(r, 2, 6)})(-${int(r, 2, 6)}) - ${int(r, 2, 9)}`, level: 2 }),
    (r) => ({ kind: 'evaluate', given: `(-${int(r, 2, 6)})^2 - ${int(r, 2, 9)}`, level: 2 }),
  ],
  arithmetic: [
    (r) => ({ kind: 'evaluate', given: `${int(r, 12, 40)} + ${int(r, 12, 40)} - ${int(r, 5, 20)}`, level: 1 }),
    (r) => ({ kind: 'evaluate', given: `${int(r, 3, 9)} * ${int(r, 6, 12)} - ${int(r, 5, 30)}`, level: 1 }),
  ],
  'exponent-rules': [
    (r) => ({ kind: 'simplify', given: `x^${int(r, 2, 5)} * x^${int(r, 2, 5)}`, level: 1 }),
    (r) => ({ kind: 'simplify', given: `(x^${int(r, 2, 4)})^${int(r, 2, 3)}`, level: 1 }),
    (r) => ({ kind: 'simplify', given: `(${int(r, 2, 4)}x)^${int(r, 2, 3)}`, level: 2 }),
    (r) => {
      const b = int(r, 2, 4);
      return { kind: 'simplify', given: `x^${b + int(r, 1, 4)} / x^${b}`, level: 2 };
    },
    (r) => ({ kind: 'simplify', given: `${int(r, 2, 5)}x^${int(r, 2, 4)} * ${int(r, 2, 5)}x^${int(r, 1, 3)}`, level: 2 }),
  ],
  'expanding-binomials': [
    (r) => ({ kind: 'expand', given: `(x ${plus(nz(r, -7, 7))})^2`, level: 2 }),
    (r) => ({ kind: 'expand', given: `(x ${plus(nz(r, -7, 7))})(x ${plus(nz(r, -7, 7))})`, level: 2 }),
    (r) => ({ kind: 'expand', given: `(${int(r, 2, 3)}x ${plus(nz(r, -5, 5))})(x ${plus(nz(r, -5, 5))})`, level: 3 }),
  ],
  factoring: [
    (r) => {
      const p = nz(r, -7, 7);
      const q = nz(r, -7, 7);
      const b = p + q;
      return { kind: 'factor', given: `x^2 ${b === 0 ? '' : `${plus(b).replace(/ 1$/, ' ')}x `}${plus(p * q)}`.replace(/\s+/g, ' '), level: 2 };
    },
    (r) => {
      const a = int(r, 2, 6);
      return { kind: 'factor', given: `${a}x^2 ${plus(a * nz(r, -5, 5))}x`, level: 1 };
    },
    (r) => {
      const k = int(r, 2, 9);
      return { kind: 'factor', given: `x^2 - ${k * k}`, level: 2 };
    },
  ],
  'zero-product': [
    (r) => ({ kind: 'quadratic', given: `(x ${plus(nz(r, -8, 8))})(x ${plus(nz(r, -8, 8))}) = 0`, level: 1 }),
    (r) => {
      const p = nz(r, -6, 6);
      let q = nz(r, -6, 6);
      if (q === p) q = -p;
      const b = -(p + q);
      const c = p * q;
      return { kind: 'quadratic', given: `x^2 ${b === 0 ? '' : `${plus(b).replace(/ 1$/, ' ')}x `}${plus(c)} = 0`.replace(/\s+/g, ' '), level: 2 };
    },
  ],
  'square-root-pm': [
    (r) => {
      const k = int(r, 2, 12);
      return { kind: 'quadratic', given: `x^2 = ${k * k}`, level: 1 };
    },
    (r) => {
      const k = int(r, 2, 9);
      const a = int(r, 2, 5);
      return { kind: 'quadratic', given: `${a}x^2 = ${a * k * k}`, level: 2 };
    },
    (r) => {
      const k = int(r, 2, 9);
      return { kind: 'quadratic', given: `x^2 - ${k * k} = 0`, level: 1 };
    },
  ],
  'dividing-by-variable': [
    (r) => ({ kind: 'quadratic', given: `x^2 = ${int(r, 2, 9)}x`, level: 2 }),
    (r) => {
      const a = int(r, 2, 4);
      return { kind: 'quadratic', given: `${a}x^2 = ${a * int(r, 2, 6)}x`, level: 2 };
    },
  ],
  'inequality-flip': [
    (r) => {
      const a = int(r, 2, 6);
      return { kind: 'inequality', given: `-${a}x ${pick(r, ['>', '<', '>=', '<='])} ${a * nz(r, -6, 6)}`, level: 1 };
    },
    (r) => {
      const a = int(r, 2, 5);
      const b = int(r, 1, 9);
      return { kind: 'inequality', given: `${b} - ${a}x ${pick(r, ['>', '<'])} ${b - a * nz(r, -5, 5)}`, level: 2 };
    },
    (r) => {
      const a = int(r, 2, 6);
      return { kind: 'inequality', given: `${a}x ${plus(nz(r, -9, 9))} ${pick(r, ['>', '<='])} ${int(r, 5, 30)}`, level: 1 };
    },
  ],
  fractions: [
    (r) => {
      const [b, d] = pick(r, [[2, 3], [3, 4], [2, 5], [4, 6], [3, 5]]);
      return { kind: 'evaluate', given: `${int(r, 1, b - 1)}/${b} + ${int(r, 1, d - 1)}/${d}`, level: 1 };
    },
    (r) => {
      const [b, d] = pick(r, [[2, 3], [3, 4], [2, 5]]);
      return { kind: 'simplify', given: `x/${b} + x/${d}`, level: 2 };
    },
  ],
  'clearing-fractions': [
    (r) => {
      const a = int(r, 2, 5);
      const b = nz(r, -6, 6);
      const x = a * nz(r, -4, 4);
      return { kind: 'linear', given: `x/${a} ${plus(b)} = ${x / a + b}`, level: 2 };
    },
    (r) => {
      const [a, b] = pick(r, [[2, 3], [2, 4], [3, 6]]);
      const x = a * b * nz(r, -2, 2);
      return { kind: 'linear', given: `x/${a} + x/${b} = ${x / a + x / b}`, level: 3 };
    },
  ],
  'order-of-operations': [
    (r) => ({ kind: 'evaluate', given: `${int(r, 2, 9)} + ${int(r, 2, 6)} * ${int(r, 2, 6)}`, level: 1 }),
    (r) => ({ kind: 'evaluate', given: `${int(r, 20, 40)} - ${int(r, 2, 4)} * ${int(r, 2, 4)}^2`, level: 2 }),
    (r) => ({ kind: 'evaluate', given: `(${int(r, 2, 6)} + ${int(r, 2, 6)}) * ${int(r, 2, 5)} - ${int(r, 2, 9)}`, level: 1 }),
    (r) => {
      const v = nz(r, -4, 4);
      return { kind: 'evaluate', given: `${int(r, 2, 4)}x^2 ${plus(nz(r, -5, 5))}x`, subs: { x: String(v) }, prompt: `Evaluate when x = ${v}`, level: 2 };
    },
  ],
  'quadratic-formula': [
    (r) => {
      const opts = [[1, 3, -1], [1, 5, 2], [1, -4, 1], [2, 3, -1], [1, 1, -3], [1, -6, 7], [2, -5, 1]];
      const [a, b, c] = pick(r, opts);
      return { kind: 'quadratic', given: `${co(a)}x^2 ${plus(b).replace(/ 1$/, ' ')}x ${plus(c)} = 0`.replace(/ x /, 'x ').replace(/\s+/g, ' '), level: 3 };
    },
  ],
  systems: [
    (r) => {
      const x = nz(r, -6, 6);
      const y = nz(r, -6, 6);
      return { kind: 'system', given: `x + y = ${x + y}, x - y = ${x - y}`, level: 1 };
    },
    (r) => {
      const x = nz(r, -5, 5);
      const y = nz(r, -5, 5);
      const a = int(r, 2, 4);
      return { kind: 'system', given: `${a}x + y = ${a * x + y}, x - y = ${x - y}`, level: 2 };
    },
  ],
  'simplest-form': [
    (r) => {
      const g = int(r, 2, 6);
      const [n, d] = pick(r, [[2, 3], [3, 4], [1, 2], [3, 5], [5, 6]]);
      return { kind: 'evaluate', given: `${n * g}/${d * g}`, prompt: 'Write in simplest form', level: 1 };
    },
  ],
};

let counter = 0;

/** x^n, written without a ^1 */
const xp = (n: number): string => (n === 1 ? 'x' : `x^${n}`);
const D = (body: string, level: 1 | 2 | 3 = 1): Draft => ({ kind: 'derivative', given: `d/dx(${body})`, level });
const I = (body: string, level: 1 | 2 | 3 = 1): Draft => ({ kind: 'integral', given: `∫ ${body} dx`, level });

/** Calculus 1 and 2. Coefficients are chosen so the answers stay in whole numbers or small fractions. */
const CALC_MAKERS: Partial<Record<ConceptId, ((r: R) => Draft)[]>> = {
  limits: [
    (r) => {
      const a = int(r, 2, 7);
      return { kind: 'limit', given: `lim x→${a} (x^2 - ${a * a})/(x - ${a})`, level: 1 };
    },
    (r) => {
      const a = int(r, 1, 4);
      return { kind: 'limit', given: `lim x→${a} (x^2 ${plus(int(r, 1, 5))}x ${plus(nz(r, -6, 6))})`, level: 1 };
    },
    (r) => {
      const a = int(r, 1, 5);
      const k = int(r, 1, 6);
      // (x − a)(x + k) over (x − a)
      return { kind: 'limit', given: `lim x→${a} (x^2 ${plus(k - a)}x - ${a * k})/(x - ${a})`.replace('+ 0x ', ''), level: 2 };
    },
    (r) => {
      const q = int(r, 1, 4);
      return { kind: 'limit', given: `lim x→inf (${q * int(r, 1, 5)}x^2 ${plus(nz(r, -5, 5))}x)/(${co(q)}x^2 ${plus(int(r, 1, 7))})`, level: 2 };
    },
    (r) => ({ kind: 'limit', given: `lim x→0 sin(${int(r, 2, 6)}x)/x`, level: 3 }),
  ],
  'power-rule': [
    (r) => D(`${co(int(r, 2, 6))}${xp(int(r, 2, 5))}`, 1),
    (r) => D(`${co(int(r, 1, 5))}${xp(int(r, 2, 4))} ${plus(nz(r, -7, 7))}x ${plus(nz(r, -9, 9))}`, 1),
    (r) => D(`x^${int(r, 4, 6)} ${plus(nz(r, -4, 4))}x^${int(r, 2, 3)} ${plus(nz(r, -8, 8))}`, 2),
    (r) => D(`${int(r, 2, 6)}/x^${int(r, 1, 3)}`.replace('x^1', 'x'), 3),
  ],
  'product-rule': [
    (r) => D(`${xp(int(r, 1, 4))} ${pick(r, ['sin(x)', 'cos(x)', 'e^x'])}`, 1),
    (r) => D(`(${co(int(r, 1, 4))}x ${plus(nz(r, -5, 5))})(x^2 ${plus(nz(r, -6, 6))})`, 2),
    (r) => D(`${xp(int(r, 2, 4))} ln(x)`, 2),
    (r) => D(`e^x ${pick(r, ['sin(x)', 'cos(x)'])}`, 3),
  ],
  'quotient-rule': [
    (r) => D(`(${co(int(r, 1, 5))}x ${plus(nz(r, -6, 6))})/(x ${plus(nz(r, -5, 5))})`, 1),
    (r) => D(`x^2/(x ${plus(nz(r, -5, 5))})`, 2),
    (r) => D(`${pick(r, ['sin(x)', 'e^x', 'cos(x)'])}/${xp(int(r, 1, 2))}`, 3),
  ],
  'chain-rule': [
    (r) => D(`(${co(int(r, 2, 5))}x ${plus(nz(r, -6, 6))})^${int(r, 2, 5)}`, 1),
    (r) => D(`${pick(r, ['sin', 'cos'])}(${int(r, 2, 7)}x)`, 1),
    (r) => D(`(x^2 ${plus(nz(r, -6, 6))})^${int(r, 2, 4)}`, 2),
    (r) => D(`e^(${int(r, 2, 6)}x)`, 2),
    (r) => D(`ln(x^2 ${plus(int(r, 1, 8))})`, 3),
    (r) => D(`sin(x^${int(r, 2, 3)})`, 3),
  ],
  'trig-derivatives': [
    (r) => D(`${co(int(r, 1, 6))}sin(x) ${plus(nz(r, -6, 6))}cos(x)`.replace(/ 1cos/, ' cos'), 1),
    (r) => D(`${xp(int(r, 2, 4))} ${plus(nz(r, -5, 5))}cos(x)`.replace(/ 1cos/, ' cos'), 1),
    (r) => D(`${co(int(r, 2, 5))}tan(x) ${plus(nz(r, -5, 5))}sin(x)`.replace(/ 1sin/, ' sin'), 2),
  ],
  'exp-log-derivatives': [
    (r) => D(`${co(int(r, 2, 6))}e^x ${plus(nz(r, -4, 4))}${xp(int(r, 2, 3))}`.replace(/ 1x/, ' x'), 1),
    (r) => D(`${co(int(r, 2, 6))}ln(x) ${plus(nz(r, -5, 5))}x`, 1),
    (r) => D(`e^(${int(r, 2, 6)}x) ${plus(nz(r, -5, 5))}x`, 2),
  ],
  antiderivatives: [
    (r) => {
      const n = int(r, 1, 4);
      return I(`${co((n + 1) * int(r, 1, 3))}${xp(n)}`, 1);
    },
    (r) => I(`(${co(3 * int(r, 1, 3))}x^2 ${plus(2 * nz(r, -4, 4))}x ${plus(nz(r, -7, 7))})`, 1),
    (r) => I(`(${co(int(r, 2, 6))}${pick(r, ['cos(x)', 'sin(x)'])} ${plus(2 * nz(r, -4, 4))}x)`, 2),
    (r) => I(`(${co(int(r, 2, 6))}e^x ${plus(3 * nz(r, -3, 3))}x^2)`, 2),
    (r) => I(`${int(r, 2, 6)}/x`, 3),
  ],
  'constant-of-integration': [
    (r) => I(`${2 * int(r, 1, 6)}x`, 1),
    (r) => I(`${int(r, 2, 9)}`, 1),
    (r) => I(`${co(3 * int(r, 1, 3))}x^2`, 1),
    (r) => I(pick(r, ['cos(x)', 'e^x', 'sin(x)']), 2),
  ],
  'u-substitution': [
    (r) => I(`${pick(r, ['cos', 'sin'])}(${int(r, 2, 6)}x)`, 1),
    (r) => I(`e^(${int(r, 2, 6)}x)`, 1),
    (r) => I(`(${co(int(r, 2, 4))}x ${plus(nz(r, -5, 5))})^${int(r, 2, 4)}`, 2),
    (r) => I(`2x(x^2 ${plus(nz(r, -6, 6))})^${int(r, 2, 4)}`, 2),
    (r) => I(`x ${pick(r, ['cos', 'sin'])}(x^2)`, 3),
    (r) => I(`${pick(r, ['cos(x) sin(x)^2', 'sin(x) cos(x)^3', 'x e^(x^2)'])}`, 3),
  ],
  'integration-by-parts': [
    (r) => I(`${co(int(r, 1, 4))}x e^x`, 1),
    (r) => I(`x ${pick(r, ['cos(x)', 'sin(x)'])}`, 1),
    (r) => I(`x e^(${int(r, 2, 4)}x)`, 2),
    (r) => I(pick(r, ['ln(x)', 'x ln(x)']), 2),
    (r) => I(`x^2 ${pick(r, ['e^x', 'sin(x)'])}`, 3),
  ],
  'definite-integrals': [
    (r) => {
      const n = int(r, 1, 3);
      return { kind: 'definite', given: `∫[0, ${int(r, 1, 3)}] ${co((n + 1) * int(r, 1, 2))}${xp(n)} dx`, level: 1 };
    },
    (r) => {
      const a = int(r, 0, 2);
      return { kind: 'definite', given: `∫[${a}, ${a + int(r, 1, 3)}] (2x ${plus(nz(r, -4, 4))}) dx`, level: 1 };
    },
    (r) => ({ kind: 'definite', given: `∫[1, ${int(r, 2, 4)}] (3x^2 ${plus(2 * nz(r, -3, 3))}x) dx`, level: 2 }),
    (r) => ({ kind: 'definite', given: `∫[0, ${pick(r, ['pi', 'pi/2'])}] ${pick(r, ['sin(x)', 'cos(x)'])} dx`, level: 3 }),
  ],
};

const MAKERS = { ...ALGEBRA_MAKERS, ...CALC_MAKERS } as Record<ConceptId, ((r: R) => Draft)[]>;

function build(d: Draft, concept: ConceptId, source: Problem['source']): Problem {
  counter++;
  const given = d.given.replace(/\+ -/g, '- ').replace(/\s+/g, ' ').replace(/ 1x/g, ' x').replace(/\((-?)1x/g, '($1x').trim();
  return {
    id: `g-${concept}-${seedFrom(given)}-${counter}`,
    kind: d.kind,
    prompt: d.prompt ?? PROMPTS[d.kind],
    given,
    subs: d.subs,
    variable: d.kind === 'derivative' || d.kind === 'integral' || d.kind === 'definite' || d.kind === 'limit' ? 'x' : undefined,
    concepts: [concept],
    source,
    level: d.level ?? 1,
  };
}

/** n fresh problems that exercise one concept, easiest first. */
export function practiceFor(concept: ConceptId, n: number, seed: number, source: Problem['source'] = 'generated'): Problem[] {
  const r = rng(seed);
  const makers = MAKERS[concept] ?? MAKERS['inverse-operations'];
  const out: Problem[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < n && guard++ < n * 12) {
    const maker = makers[(out.length + Math.floor(r() * 2)) % makers.length];
    const p = build(maker(r), concept, source);
    if (seen.has(p.given)) continue;
    seen.add(p.given);
    out.push(p);
  }
  return out.sort((a, b) => (a.level ?? 1) - (b.level ?? 1));
}

export const ALL_CONCEPTS = Object.keys(MAKERS) as ConceptId[];
