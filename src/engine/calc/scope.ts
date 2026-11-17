import { E, diff, equiv, mul, simp, subst, toLatex, toText, tryParse } from './expr';

/**
 * What a learner's working means beyond the line in front of it.
 *
 * People write "let u = x² + 1", "so du = 2x dx", "⇒ ∫ cos u du": a name for something, a differential, and lines in
 * the new letter. None of these is the whole problem written another way, so each needs reading in its own right:
 *  - joining words (let, so, hence, it implies, ⇒ …) are taken off before the maths is read;
 *  - "u = …" gives a letter a meaning for the rest of the attempt, and is a valid move in itself;
 *  - "du = … dx" (or du/dx = …, or u′ = …) is checked against that meaning: du must be u′ dx;
 *  - a line in u is read in x by putting the meaning back (and du back as u′ dx) before it is checked.
 */

/** Words that join one line of working to the next. They say how the writer got there, not what is true. */
const JOIN =
  /^(?:let|so|hence|thus|therefore|then|now|and|also|next|which\s+gives|this\s+gives|that\s+gives|gives|we\s+get|we\s+have|it\s+implies|this\s+implies|which\s+implies|implies|that\s+is|i\.?\s?e\.?|where|since|because|substitut(?:e|ing)|put|set|soit|donc|alors|d[’']o[uù]|ainsi|on\s+a|on\s+obtient|posons|пусть|значит|тогда|следовательно|откуда|итак|получаем|имеем|положим|где|⇒|=>|∴|⟹)\s*[:,]?\s*/i;

/** Take the joining words off the front of a piece of working, as many as there are ("so then"). */
export function unjoin(text: string): { body: string; words: string } {
  let body = text.trim();
  let words = '';
  for (let i = 0; i < 4; i++) {
    const m = JOIN.exec(body);
    if (!m || !m[0]) break;
    words += m[0];
    body = body.slice(m[0].length).trim();
  }
  // "= sin u + C" carries on from the line above
  if (/^=\s*/.test(body) && !body.slice(1).includes('=')) body = body.replace(/^=\s*/, '');
  return { body, words: words.trim() };
}

/** Mostly words, not maths: "since cos is even", "this is a standard integral". */
export function isWords(text: string): boolean {
  // function names may be glued to a number (4sin x), so they are taken out wherever they are
  const bare = text.replace(/(?:arcsin|arccos|arctan|asin|acos|atan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|sqrt|ln|log|lim|exp|pi)/gi, ' ').replace(/\b(?:dx|dy|dt|du|dv|or|and|no)\b/gi, ' ');
  // a word has a vowel: "xdx" or "uv" is maths
  const words = (bare.match(/[a-zA-Zа-яА-ЯёЁàâçéèêëîïôûùüÿœ]{3,}/g) ?? []).filter((w) => /[aeiouyаеёиоуыэюяàâéèêëîïôûùüÿœ]/i.test(w));
  return words.length >= 2;
}

/** Split a line into its separate statements: "u = x² + 1 ⇒ du = 2x dx", "u = x, dv = eˣ dx". Brackets are kept whole. */
export function statements(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    const rest = text.slice(i);
    const arrow = /^(?:⇒|=>|∴|⟹|;)/.exec(rest);
    if (depth === 0 && arrow) {
      push();
      i += arrow[0].length - 1;
      continue;
    }
    if (depth === 0 && ch === ',' && /^,\s*\S/.test(rest)) {
      push();
      continue;
    }
    cur += ch;
  }
  push();
  return out.length ? out : [text];
}

/** Letters that already mean something in a calculus line, so "y = …" stays a label and C stays the constant. */
const RESERVED = new Set(['y', 'I', 'L', 'A', 'F', 'C', 'K', 'c', 'e', 'd']);

export class Scope {
  /** What each named letter stands for, in the problem's variable. */
  readonly defs = new Map<string, E>();
  /** dv = … dx written before v itself: the derivative v must have. */
  readonly owed = new Map<string, E>();

  constructor(readonly v: string) {}

  get empty(): boolean {
    return this.defs.size === 0;
  }

  /** The letters named so far, for working out whether a line still has a letter in it that needs putting back. */
  mentionsNamed(e: E): string | null {
    for (const name of this.defs.keys()) if (mentionsVar(e, name)) return name;
    return null;
  }

  /** Read an expression in the problem's variable: named letters replaced by what they stand for, d(letter) by its derivative. */
  back(e: E): E {
    if (this.empty) return e;
    let out = e;
    // a meaning may use an earlier name (v defined from dv): a couple of passes put everything back
    for (let i = 0; i < 3; i++) out = this.once(out);
    return out;
  }

  private once(x: E): E {
    const r = (y: E): E => this.once(y);
    switch (x.t) {
      case 'v':
        return this.defs.get(x.name) ?? x;
      case '+':
      case '*':
        return { t: x.t, a: x.a.map(r) };
      case '/':
        return { t: '/', n: r(x.n), d: r(x.d) };
      case '^':
        return { t: '^', b: r(x.b), e: r(x.e) };
      case 'neg':
        return { t: 'neg', a: r(x.a) };
      case 'f':
        return { ...x, a: r(x.a) };
      case 'd':
        return { ...x, a: r(x.a) };
      case 'int': {
        const g = this.defs.get(x.v);
        if (g && !x.lo && !x.hi) {
          // ∫ f(u) du is ∫ f(g(x)) g′(x) dx
          const inner = subst(x.a, x.v, g);
          return { t: 'int', a: mul(r(inner), simp(diff(g, this.v))), v: this.v };
        }
        // a definite integral in its own letter is a number: leave its letter alone
        if (x.lo && x.hi) return x;
        return { ...x, a: r(x.a) };
      }
      case 'lim':
        return { ...x, a: r(x.a), to: r(x.to) };
      default:
        return x;
    }
  }

  /** u′ written with a named letter: "u'v + uv'" becomes the derivatives written out, before the line is read. */
  primesOut(text: string): string {
    if (this.empty) return text;
    return text.replace(/([a-zA-Z])\s*'(?!')/g, (m, name: string) => {
      const g = this.defs.get(name);
      return g ? `(${toText(simp(diff(g, this.v)))})` : m;
    });
  }
}

function mentionsVar(e: E, name: string): boolean {
  switch (e.t) {
    case 'n':
      return false;
    case 'v':
      return e.name === name;
    case '+':
    case '*':
      return e.a.some((x) => mentionsVar(x, name));
    case '/':
      return mentionsVar(e.n, name) || mentionsVar(e.d, name);
    case '^':
      return mentionsVar(e.b, name) || mentionsVar(e.e, name);
    case 'int':
      return e.v === name || mentionsVar(e.a, name);
    case 'lim':
      return mentionsVar(e.a, name) || mentionsVar(e.to, name);
    default:
      return mentionsVar(e.a, name);
  }
}

/** One statement of working that is not the problem written another way. */
export type SideWork =
  | { kind: 'name'; name: string; e: E; latex: string; ok: true }
  | { kind: 'name'; name: string; e: E; latex: string; ok: false; owed: E }
  | { kind: 'differential'; latex: string; ok: boolean; name: string; should?: E; owing?: boolean }
  | { kind: 'prime'; latex: string; ok: boolean; name: string; should: E };

/** "d" + letter at the end of a piece: the coefficient in front of it and the letter. */
function differentialSide(s: string): { coef: string; of: string } | { ratioOf: string; over: string } | null {
  const t = s.trim();
  const ratio = /^d\s*([a-zA-Z])\s*\/\s*d\s*([a-zA-Z])$/.exec(t);
  if (ratio) return { ratioOf: ratio[1], over: ratio[2] };
  const over = /^d\s*([a-zA-Z])\s*\/\s*(.+)$/.exec(t);
  if (over) return { coef: `1/(${over[2]})`, of: over[1] };
  const m = /^(.*?)\s*[*·]?\s*d\s*([a-zA-Z])$/.exec(t);
  if (!m) return null;
  const coef = m[1].trim().replace(/[*·]\s*$/, '').trim();
  return { coef: coef === '' ? '1' : coef === '-' ? '-1' : coef, of: m[2] };
}

/**
 * Is this statement side working (a name, a differential, a derivative of a named letter)? If so, what it says and
 * whether it is right. Returns null for an ordinary line of the problem.
 */
export function sideWork(stmt: string, scope: Scope): SideWork | null {
  const v = scope.v;
  if (/d\s*\/\s*d[a-z]|∫|\blim\b/.test(stmt)) return null;
  const parts = stmt.split('=');
  if (parts.length !== 2) return null;
  const [lhs, rhs] = parts.map((x) => x.trim());
  if (!lhs || !rhs) return null;

  // u′ = 2x, for a named u
  const prime = /^([a-zA-Z])\s*'\s*(?:\(\s*[a-z]\s*\))?$/.exec(lhs);
  if (prime && scope.defs.has(prime[1])) {
    const should = simp(diff(scope.defs.get(prime[1]) as E, v));
    const said = tryParse(scope.primesOut(rhs), v);
    const ok = !!said && equiv(scope.back(said), should, v) === true;
    return { kind: 'prime', name: prime[1], ok, should, latex: `${prime[1]}' = ${said ? toLatex(said) : rhs}` };
  }

  // du = 2x dx, du/dx = 2x, dx = du/(2x), ½ du = x dx …
  const L = differentialSide(lhs);
  const R = differentialSide(rhs);
  if (L || R) {
    const known = (name: string): E | null => (name === v ? null : scope.defs.get(name) ?? null);
    const rate = (name: string): E | null => (name === v ? { t: 'n', v: 1 } : known(name) ? simp(diff(known(name) as E, v)) : null);
    // both sides as (coefficient × derivative of the letter), all over dx
    const asRate = (side: string, d: ReturnType<typeof differentialSide>): { e: E | null; letter?: string } => {
      if (!d) {
        const e = tryParse(side, v);
        return { e: e ? scope.back(e) : null };
      }
      if ('ratioOf' in d) {
        const top = rate(d.ratioOf);
        const bottom = rate(d.over);
        return { e: top && bottom ? { t: '/', n: top, d: bottom } : null, letter: top ? undefined : d.ratioOf };
      }
      const c = tryParse(d.coef, v);
      const r = rate(d.of);
      return { e: c && r ? mul(scope.back(c), r) : null, letter: r ? undefined : d.of };
    };
    const a = asRate(lhs, L);
    const b = asRate(rhs, R);
    const latex = `${lhs} = ${rhs}`.replace(/\bd([a-zA-Z])\b/g, '\\,d$1');
    // dv = e²ˣ dx before v has a meaning: it says what v′ has to be
    if (L && !('ratioOf' in L) && L.coef === '1' && a.letter && b.e) {
      scope.owed.set(a.letter, simp(b.e));
      return { kind: 'differential', name: a.letter, ok: true, owing: true, latex };
    }
    if (!a.e || !b.e) return null;
    const ok = equiv(a.e, b.e, v) === true;
    const named = L && !('ratioOf' in L) && L.of !== v ? L.of : R && !('ratioOf' in R) && R.of !== v ? R.of : L && 'ratioOf' in L ? L.ratioOf : '';
    const meaning = named ? scope.defs.get(named) : undefined;
    return { kind: 'differential', name: named, ok, should: meaning ? simp(diff(meaning, v)) : undefined, latex };
  }

  // u = x² + 1: a name for something, for the rest of the working
  const name = /^([a-zA-Z])$/.exec(lhs);
  if (name && name[1] !== v && !RESERVED.has(name[1])) {
    const e = tryParse(scope.primesOut(rhs), v);
    if (!e) return null;
    const meaning = scope.back(e);
    const owed = scope.owed.get(name[1]);
    scope.defs.set(name[1], meaning);
    const latex = `${name[1]} = ${toLatex(e)}`;
    // v from dv: differentiating it has to give dv back
    if (owed && equiv(simp(diff(meaning, v)), owed, v) !== true) return { kind: 'name', name: name[1], e: meaning, latex, ok: false, owed };
    return { kind: 'name', name: name[1], e: meaning, latex, ok: true };
  }
  return null;
}
