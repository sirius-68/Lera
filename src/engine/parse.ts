import { Node, Relation, RelOp, Statement, walk, replaceAt, negate, statementToLatex } from './ast';
import { fracFromDecimal } from './frac';

/**
 * Parser for one line of student working.
 *
 * Accepts what people actually type: `3x + 4 = 19`, `2(x−3)`, `x² − 9`,
 * `x = 3 or x = -3`, `x = ±3`, `(x+2)(x-5)=0`, `-2x ≥ 6`, `no solution`.
 */

export type ParseResult =
  | { ok: true; st: Statement }
  | { ok: false; error: string; pos: number };

type Tok =
  | { k: 'num'; s: string; pos: number }
  | { k: 'var'; s: string; pos: number }
  | { k: 'op'; s: string; pos: number }
  | { k: 'rel'; s: RelOp; pos: number }
  | { k: 'word'; s: 'or' | 'and' | 'sqrt' | 'abs'; pos: number }
  | { k: 'sep'; s: string; pos: number }
  | { k: 'end'; s: ''; pos: number };

const SUPER: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-',
};

class ParseError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(message);
    this.pos = pos;
  }
}

/** Make typed/pasted maths uniform before tokenising. */
export function normalizeInput(src: string): string {
  let s = src
    .replace(/[−–—‒]/g, '-')
    .replace(/[×·∙⋅•]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[≤⩽]/g, '<=')
    .replace(/[≥⩾]/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/=</g, '<=')
    .replace(/=>/g, '>=')
    .replace(/\*\*/g, '^')
    .replace(/√/g, 'sqrt')
    .replace(/[“”"]/g, '')
    .replace(/ /g, ' ');
  // x² -> x^2, x⁻¹ -> x^(-1)
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => {
    const plain = m.split('').map((c) => SUPER[c]).join('');
    return plain.startsWith('-') ? `^(${plain})` : `^${plain}`;
  });
  return s;
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
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
      if (j === i) throw new ParseError('A number is missing its digits.', i);
      toks.push({ k: 'num', s: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
      const word = src.slice(i, j);
      const lower = word.toLowerCase();
      if (lower === 'or' || lower === 'and' || lower === 'sqrt' || lower === 'abs') {
        toks.push({ k: 'word', s: lower, pos: i });
      } else {
        // letters stuck together are a product of single-letter variables: xy -> x*y.
        // A keyword glued to the end (`3orx`) is rare enough to ignore.
        for (let k = 0; k < word.length; k++) toks.push({ k: 'var', s: word[k], pos: i + k });
      }
      i = j;
      continue;
    }
    if (c === '<' || c === '>' || c === '!' || c === '=') {
      const two = src.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '!=') {
        toks.push({ k: 'rel', s: two, pos: i });
        i += 2;
        continue;
      }
      if (c === '!') throw new ParseError('I don’t know what “!” means here.', i);
      if (two === '==') {
        toks.push({ k: 'rel', s: '=', pos: i });
        i += 2;
        continue;
      }
      toks.push({ k: 'rel', s: c as RelOp, pos: i });
      i++;
      continue;
    }
    if ('+-*/^()|±'.includes(c)) {
      toks.push({ k: 'op', s: c, pos: i });
      i++;
      continue;
    }
    if (c === ',' || c === ';') {
      toks.push({ k: 'sep', s: c, pos: i });
      i++;
      continue;
    }
    throw new ParseError(`I can’t read “${c}” as maths.`, i);
  }
  toks.push({ k: 'end', s: '', pos: src.length });
  return toks;
}

class Parser {
  private i = 0;
  private absDepth = 0;
  constructor(private toks: Tok[]) {}

  private peek(): Tok {
    return this.toks[this.i];
  }
  private next(): Tok {
    return this.toks[this.i++];
  }
  private isOp(s: string): boolean {
    const t = this.peek();
    return t.k === 'op' && t.s === s;
  }
  atEnd(): boolean {
    return this.peek().k === 'end';
  }
  pos(): number {
    return this.peek().pos;
  }

  /** Does the next token begin a factor that can be multiplied implicitly? */
  private startsAtom(): boolean {
    const t = this.peek();
    if (t.k === 'num' || t.k === 'var') return true;
    if (t.k === 'word') return t.s === 'sqrt' || t.s === 'abs';
    if (t.k === 'op') return t.s === '(' || (t.s === '|' && this.absDepth === 0);
    return false;
  }

  expr(): Node {
    const first = this.term();
    const args: Node[] = [first];
    for (;;) {
      if (this.isOp('+')) {
        this.next();
        args.push(this.term());
      } else if (this.isOp('-')) {
        this.next();
        args.push({ t: 'neg', arg: this.term() });
      } else if (this.isOp('±')) {
        this.next();
        args.push({ t: 'pm', arg: this.term() });
      } else break;
    }
    return args.length === 1 ? first : { t: 'add', args };
  }

  /** A signed product. The sign covers the whole product: -2x is -(2x), so it reads as one term. */
  private term(): Node {
    if (this.isOp('-')) {
      this.next();
      return { t: 'neg', arg: this.term() };
    }
    if (this.isOp('+')) {
      this.next();
      return this.term();
    }
    if (this.isOp('±')) {
      this.next();
      return { t: 'pm', arg: this.term() };
    }
    let left = this.power();
    for (;;) {
      if (this.isOp('*')) {
        this.next();
        left = this.times(left, this.unary());
      } else if (this.isOp('/')) {
        this.next();
        left = { t: 'div', num: left, den: this.unary() };
      } else if (this.startsAtom()) {
        const t = this.peek();
        const right = this.power();
        if (t.k === 'num') {
          // `x 2` / `(x+1)3` is almost always a typo for a power or a product
          if (left.t === 'num') throw new ParseError('Two numbers side by side — is a sign missing between them?', t.pos);
          throw new ParseError('Put the number in front (3x), or use ^ for a power (x^3).', t.pos);
        }
        left = this.times(left, right);
      } else break;
    }
    return left;
  }

  private times(a: Node, b: Node): Node {
    if (a.t === 'mul') return { t: 'mul', args: [...a.args, b] };
    return { t: 'mul', args: [a, b] };
  }

  private unary(): Node {
    if (this.isOp('-')) {
      this.next();
      return { t: 'neg', arg: this.unary() };
    }
    if (this.isOp('+')) {
      this.next();
      return this.unary();
    }
    if (this.isOp('±')) {
      this.next();
      return { t: 'pm', arg: this.unary() };
    }
    return this.power();
  }

  private power(): Node {
    const base = this.atom();
    if (this.isOp('^')) {
      this.next();
      // exponent binds tightly and may be signed: x^-2, x^(n+1)
      let exp: Node;
      if (this.isOp('-')) {
        this.next();
        exp = { t: 'neg', arg: this.power() };
      } else exp = this.power();
      return { t: 'pow', base, exp };
    }
    return base;
  }

  private atom(): Node {
    const t = this.next();
    if (t.k === 'num') return { t: 'num', v: fracFromDecimal(t.s), raw: t.s };
    if (t.k === 'var') return { t: 'var', name: t.s };
    if (t.k === 'word' && (t.s === 'sqrt' || t.s === 'abs')) {
      if (this.isOp('(')) {
        this.next();
        const inner = this.expr();
        this.expect(')');
        return { t: t.s, arg: inner };
      }
      // √9 or √x with no brackets: take the next single factor
      return { t: t.s, arg: this.atom() };
    }
    if (t.k === 'op' && t.s === '(') {
      const saved = this.absDepth;
      this.absDepth = 0;
      const inner = this.expr();
      this.absDepth = saved;
      this.expect(')');
      return inner;
    }
    if (t.k === 'op' && t.s === '|') {
      this.absDepth++;
      const inner = this.expr();
      this.absDepth--;
      this.expect('|');
      return { t: 'abs', arg: inner };
    }
    if (t.k === 'end') throw new ParseError('This line stops halfway — something is missing at the end.', t.pos);
    if (t.k === 'op' && t.s === ')') throw new ParseError('There’s a closing bracket with no opening one.', t.pos);
    if (t.k === 'op' && (t.s === '*' || t.s === '/' || t.s === '^'))
      throw new ParseError(`“${t.s}” needs something before it.`, t.pos);
    throw new ParseError('I can’t read this part as maths.', t.pos);
  }

  private expect(s: string): void {
    const t = this.next();
    if (!(t.k === 'op' && t.s === s)) {
      throw new ParseError(s === ')' ? 'A bracket was opened but never closed.' : `Expected “${s}”.`, t.pos);
    }
  }

  /** expr (relop expr)* — a chain like a < x < b becomes two relations. */
  relationChain(): { exprs: Node[]; ops: RelOp[] } {
    const exprs: Node[] = [];
    const ops: RelOp[] = [];
    // tolerate a leading "=" (continuing from the line above)
    if (this.peek().k === 'rel' && this.peek().s === '=') this.next();
    exprs.push(this.expr());
    while (this.peek().k === 'rel') {
      ops.push(this.next().s as RelOp);
      exprs.push(this.expr());
    }
    return { exprs, ops };
  }

  joiner(): 'or' | 'and' | 'list' | null {
    const t = this.peek();
    if (t.k === 'word' && (t.s === 'or' || t.s === 'and')) {
      this.next();
      return t.s;
    }
    if (t.k === 'sep') {
      this.next();
      // "x = 2, or x = 3"
      const n = this.peek();
      if (n.k === 'word' && (n.s === 'or' || n.s === 'and')) {
        this.next();
        return n.s;
      }
      return 'list';
    }
    return null;
  }
}

const SPECIAL_NONE = /^(no\s+(real\s+)?solutions?|no\s+roots?|none|∅|ø|no\s+answer|нет\s+решений)\.?$/i;
const SPECIAL_ALL = /^(all\s+real(\s+numbers)?|all\s+reals|infinitely\s+many(\s+solutions)?|any\s+(real\s+)?number|identity|ℝ|x\s*∈\s*ℝ)\.?$/i;

/** Expand every ± into both signs. One ± → two expressions. */
let KEEP_PM = false;

function expandPm(n: Node): Node[] {
  if (KEEP_PM) return [n];
  const found: { path?: number[]; inner?: Node } = {};
  walk(n, (x, p) => {
    if (!found.path && x.t === 'pm') {
      found.path = p;
      found.inner = x.arg;
    }
  });
  if (!found.path || !found.inner) return [n];
  const plus = replaceAt(n, found.path, found.inner);
  const minus = replaceAt(n, found.path, negate(found.inner));
  return [...expandPm(plus), ...expandPm(minus)];
}

export function parseLine(input: string, opts: { keepPm?: boolean } = {}): ParseResult {
  const raw = input.trim().replace(/[.;,]+$/, '').trim();
  if (!raw) return { ok: false, error: 'Nothing written yet.', pos: 0 };
  if (SPECIAL_NONE.test(raw)) return { ok: true, st: { kind: 'special', value: 'none' } };
  if (SPECIAL_ALL.test(raw)) return { ok: true, st: { kind: 'special', value: 'all' } };

  KEEP_PM = !!opts.keepPm;
  try {
    const src = normalizeInput(raw);
    const p = new Parser(tokenize(src));
    const parts: { exprs: Node[]; ops: RelOp[] }[] = [];
    const joins: ('or' | 'and' | 'list')[] = [];
    parts.push(p.relationChain());
    for (;;) {
      const j = p.joiner();
      if (!j) break;
      joins.push(j);
      parts.push(p.relationChain());
    }
    if (!p.atEnd()) {
      throw new ParseError('I can’t read this part as maths.', p.pos());
    }

    // A single bare expression
    if (parts.length === 1 && parts[0].ops.length === 0) {
      const variants = expandPm(parts[0].exprs[0]);
      if (variants.length === 1) return { ok: true, st: { kind: 'expr', expr: variants[0] } };
      if (opts.keepPm) return { ok: true, st: { kind: 'expr', expr: parts[0].exprs[0] } };
      throw new ParseError('“±” only makes sense inside an equation, like x = ±3.', 0);
    }

    const rels: Relation[] = [];
    let join: 'or' | 'and' | 'list' = joins[0] ?? 'or';
    if (joins.some((j) => j !== join)) join = joins.includes('and') ? 'and' : 'or';
    let lastLhs: Node | null = null;

    for (const part of parts) {
      if (part.ops.length === 0) {
        // "x = 3 or -2" / "x = 3, -2": reuse the previous left side
        if (!lastLhs) throw new ParseError('Write the whole equation, e.g. x = 3.', 0);
        for (const v of expandPm(part.exprs[0])) rels.push({ lhs: lastLhs, op: '=', rhs: v });
        continue;
      }
      const chained = part.ops.length > 1;
      for (let i = 0; i < part.ops.length; i++) {
        const lhsV = expandPm(part.exprs[i]);
        const rhsV = expandPm(part.exprs[i + 1]);
        if (lhsV.length > 1 && part.ops[i] !== '=') throw new ParseError('“±” only works with “=”.', 0);
        for (const l of lhsV) for (const r of rhsV) rels.push({ lhs: l, op: part.ops[i], rhs: r });
        if (lhsV.length > 1 || rhsV.length > 1) join = 'or';
      }
      if (chained) {
        const allEq = part.ops.every((o) => o === '=');
        // a < x < b means both at once; a = b = c is just a running chain
        if (!allEq) join = 'and';
        else if (parts.length === 1) join = 'and';
      }
      const first = part.exprs[0];
      lastLhs = first.t === 'var' ? first : null;
    }
    return { ok: true, st: { kind: 'rel', rels, join } };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, pos: e.pos };
    const msg = e instanceof Error ? e.message : 'I can’t read this line.';
    return { ok: false, error: msg, pos: 0 };
  } finally {
    KEEP_PM = false;
  }
}

/** LaTeX for showing a line as written (± stays ±). Null if it can't be read. */
export function lineToLatex(input: string): string | null {
  const r = parseLine(input, { keepPm: true });
  return r.ok ? statementToLatex(r.st) : null;
}

/** Parse something that must be a plain expression (no relation). */
export function parseExpr(input: string): Node | null {
  const r = parseLine(input);
  return r.ok && r.st.kind === 'expr' ? r.st.expr : null;
}
