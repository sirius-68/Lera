import { Frac, frac, fIsInt, fLatex, fText, ZERO } from './frac';

/** Expression tree. Numbers are always non-negative literals; sign lives in `neg`. */
export type Node =
  | { t: 'num'; v: Frac; raw?: string }
  | { t: 'var'; name: string }
  | { t: 'add'; args: Node[] }
  | { t: 'mul'; args: Node[] }
  | { t: 'neg'; arg: Node }
  | { t: 'div'; num: Node; den: Node }
  | { t: 'pow'; base: Node; exp: Node }
  | { t: 'sqrt'; arg: Node }
  | { t: 'abs'; arg: Node }
  | { t: 'pm'; arg: Node };

export type RelOp = '=' | '<' | '>' | '<=' | '>=' | '!=';

export interface Relation {
  lhs: Node;
  op: RelOp;
  rhs: Node;
}

/** One line of working, as the student wrote it. */
export type Statement =
  | { kind: 'expr'; expr: Node }
  | { kind: 'rel'; rels: Relation[]; join: 'or' | 'and' | 'list' }
  | { kind: 'special'; value: 'none' | 'all' };

export const num = (v: number | Frac): Node =>
  typeof v === 'number' ? { t: 'num', v: frac(Math.abs(v)) } : { t: 'num', v };
export const sym = (name: string): Node => ({ t: 'var', name });
export const neg = (arg: Node): Node => ({ t: 'neg', arg });
export const add = (...args: Node[]): Node => (args.length === 1 ? args[0] : { t: 'add', args });
export const mul = (...args: Node[]): Node => (args.length === 1 ? args[0] : { t: 'mul', args });
export const div = (n: Node, d: Node): Node => ({ t: 'div', num: n, den: d });
export const pow = (base: Node, exp: Node): Node => ({ t: 'pow', base, exp });

/** Signed integer/fraction literal as a tree. */
export function lit(v: Frac): Node {
  if (v.n < 0n) return neg(lit({ n: -v.n, d: v.d }));
  if (fIsInt(v)) return { t: 'num', v };
  return div({ t: 'num', v: frac(v.n) }, { t: 'num', v: frac(v.d) });
}

export function children(n: Node): Node[] {
  switch (n.t) {
    case 'num':
    case 'var':
      return [];
    case 'add':
    case 'mul':
      return n.args;
    case 'neg':
    case 'sqrt':
    case 'abs':
    case 'pm':
      return [n.arg];
    case 'div':
      return [n.num, n.den];
    case 'pow':
      return [n.base, n.exp];
  }
}

export function withChildren(n: Node, kids: Node[]): Node {
  switch (n.t) {
    case 'num':
    case 'var':
      return n;
    case 'add':
    case 'mul':
      return { t: n.t, args: kids };
    case 'neg':
    case 'sqrt':
    case 'abs':
    case 'pm':
      return { t: n.t, arg: kids[0] };
    case 'div':
      return { t: 'div', num: kids[0], den: kids[1] };
    case 'pow':
      return { t: 'pow', base: kids[0], exp: kids[1] };
  }
}

export type Path = number[];

/** Every node with its path from the root, pre-order. */
export function walk(n: Node, visit: (node: Node, path: Path) => void, path: Path = []): void {
  visit(n, path);
  children(n).forEach((c, i) => walk(c, visit, [...path, i]));
}

export function replaceAt(n: Node, path: Path, replacement: Node): Node {
  if (path.length === 0) return replacement;
  const kids = children(n).slice();
  kids[path[0]] = replaceAt(kids[path[0]], path.slice(1), replacement);
  return withChildren(n, kids);
}

export function variablesOf(n: Node, out: Set<string> = new Set()): Set<string> {
  walk(n, (x) => {
    if (x.t === 'var') out.add(x.name);
  });
  return out;
}

export function statementVars(st: Statement): Set<string> {
  const out = new Set<string>();
  if (st.kind === 'expr') variablesOf(st.expr, out);
  if (st.kind === 'rel') for (const r of st.rels) {
    variablesOf(r.lhs, out);
    variablesOf(r.rhs, out);
  }
  return out;
}

export function containsType(n: Node, t: Node['t']): boolean {
  let found = false;
  walk(n, (x) => {
    if (x.t === t) found = true;
  });
  return found;
}

export function nodeCount(n: Node): number {
  let c = 0;
  walk(n, () => c++);
  return c;
}

/** Top-level terms of a sum, each carrying its own sign. `3x - 4` -> [3x, -4]. */
export function terms(n: Node): Node[] {
  return n.t === 'add' ? n.args : [n];
}

export function fromTerms(ts: Node[]): Node {
  if (ts.length === 0) return { t: 'num', v: ZERO };
  return ts.length === 1 ? ts[0] : { t: 'add', args: ts };
}

/** Flip the sign of a term without stacking double negatives. */
export function negate(n: Node): Node {
  return n.t === 'neg' ? n.arg : neg(n);
}

/* ───────────── printing ───────────── */

const PREC = { add: 1, neg: 2, mul: 3, div: 3, pow: 5, atom: 9 } as const;

function prec(n: Node): number {
  switch (n.t) {
    case 'add':
      return PREC.add;
    case 'neg':
    case 'pm':
      return PREC.neg;
    case 'mul':
      return PREC.mul;
    case 'div':
      return PREC.div;
    case 'pow':
      return PREC.pow;
    default:
      return PREC.atom;
  }
}

function baseName(n: Node): string | null {
  if (n.t === 'var') return n.name;
  if (n.t === 'pow' && n.base.t === 'var') return n.base.name;
  return null;
}

/** x^2 next to x^3: the same letter twice in a product. */
function sameBase(a: Node, b: Node): boolean {
  const x = baseName(a);
  return x !== null && x === baseName(b) && (a.t === 'pow' || b.t === 'pow');
}

/** Linear text that the parser reads back to the same tree. */
export function toText(n: Node): string {
  const wrap = (c: Node, min: number) => (prec(c) < min ? `(${toText(c)})` : toText(c));
  switch (n.t) {
    case 'num':
      return n.raw ?? fText(n.v);
    case 'var':
      return n.name;
    case 'add':
      return n.args
        .map((a, i) => {
          if (i === 0) return toText(a);
          if (a.t === 'neg') return ` - ${wrap(a.arg, PREC.mul)}`;
          if (a.t === 'pm') return ` ± ${wrap(a.arg, PREC.mul)}`;
          return ` + ${toText(a)}`;
        })
        .join('');
    case 'neg':
      return `-${wrap(n.arg, PREC.mul)}`;
    case 'pm':
      return `±${wrap(n.arg, PREC.mul)}`;
    case 'mul': {
      let out = '';
      n.args.forEach((a, i) => {
        const s = wrap(a, PREC.mul + (a.t === 'div' ? 1 : 0));
        if (i === 0) {
          out = s;
          return;
        }
        const prev = n.args[i - 1];
        // juxtapose where it reads naturally (3x, 2(x+1), xy); otherwise use *
        const juxta =
          !/^[0-9]/.test(s) && !(prev.t === 'num' && a.t === 'num') && !/^-/.test(s) && a.t !== 'div' && !sameBase(prev, a);
        out += juxta ? s : `*${s}`;
      });
      return out;
    }
    case 'div':
      return `${wrap(n.num, PREC.mul)}/${wrap(n.den, PREC.pow)}`;
    case 'pow':
      return `${wrap(n.base, PREC.atom)}^${wrap(n.exp, PREC.atom)}`;
    case 'sqrt':
      return `sqrt(${toText(n.arg)})`;
    case 'abs':
      return `|${toText(n.arg)}|`;
  }
}

export function toLatex(n: Node): string {
  const wrap = (c: Node, min: number) =>
    prec(c) < min ? `\\left(${toLatex(c)}\\right)` : toLatex(c);
  switch (n.t) {
    case 'num':
      return n.raw && /^\d*\.\d+$/.test(n.raw) ? n.raw : fLatex(n.v);
    case 'var':
      return n.name;
    case 'add':
      return n.args
        .map((a, i) => {
          if (i === 0) return toLatex(a);
          if (a.t === 'neg') return ` - ${wrap(a.arg, PREC.mul)}`;
          if (a.t === 'pm') return ` \\pm ${wrap(a.arg, PREC.mul)}`;
          return ` + ${toLatex(a)}`;
        })
        .join('');
    case 'neg':
      return `-${wrap(n.arg, PREC.mul)}`;
    case 'pm':
      return `\\pm ${wrap(n.arg, PREC.mul)}`;
    case 'mul': {
      let out = '';
      n.args.forEach((a, i) => {
        const s = a.t === 'div' ? toLatex(a) : wrap(a, PREC.mul);
        if (i === 0) {
          out = s;
          return;
        }
        const prev = n.args[i - 1];
        const startsWithDigit = a.t === 'num' || (a.t === 'pow' && a.base.t === 'num');
        const needDot =
          startsWithDigit || /^-/.test(s) || (a.t === 'div' && (prev.t === 'div' || prev.t === 'num')) || sameBase(prev, a);
        out += needDot ? ` \\cdot ${s}` : s;
      });
      return out;
    }
    case 'div':
      return `\\frac{${toLatex(n.num)}}{${toLatex(n.den)}}`;
    case 'pow': {
      const b = n.base.t === 'num' || n.base.t === 'var' ? toLatex(n.base) : `\\left(${toLatex(n.base)}\\right)`;
      return `${b}^{${toLatex(n.exp)}}`;
    }
    case 'sqrt':
      return `\\sqrt{${toLatex(n.arg)}}`;
    case 'abs':
      return `\\left|${toLatex(n.arg)}\\right|`;
  }
}

const OP_LATEX: Record<RelOp, string> = {
  '=': '=',
  '<': '<',
  '>': '>',
  '<=': '\\le',
  '>=': '\\ge',
  '!=': '\\ne',
};
const OP_TEXT: Record<RelOp, string> = { '=': '=', '<': '<', '>': '>', '<=': '≤', '>=': '≥', '!=': '≠' };

export function statementToLatex(st: Statement): string {
  if (st.kind === 'expr') return toLatex(st.expr);
  if (st.kind === 'special') return st.value === 'none' ? '\\text{no solution}' : '\\text{all real numbers}';
  const sep = st.join === 'and' ? ',\\quad ' : st.join === 'or' ? '\\ \\text{ or }\\ ' : ',\\quad ';
  return st.rels.map((r) => `${toLatex(r.lhs)} ${OP_LATEX[r.op]} ${toLatex(r.rhs)}`).join(sep);
}

export function statementToText(st: Statement): string {
  if (st.kind === 'expr') return toText(st.expr);
  if (st.kind === 'special') return st.value === 'none' ? 'no solution' : 'all real numbers';
  const sep = st.join === 'and' ? ' and ' : st.join === 'or' ? ' or ' : ', ';
  return st.rels.map((r) => `${toText(r.lhs)} ${OP_TEXT[r.op]} ${toText(r.rhs)}`).join(sep);
}
