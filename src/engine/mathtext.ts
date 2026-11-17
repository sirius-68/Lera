/**
 * Maths written as ordinary text, the way notes and books carry it once they are out of the file:
 *   "y = 2/3 x^(3/2) on [0, 3]: f' = √x, so L = ∫ from 0 to 3 of √(1 + x) dx = 14/3."
 *
 * Two jobs live here, and neither needs the engine to understand the maths (it only has to be drawn):
 *   mathRuns    where in a sentence each formula starts and stops, as offsets into the sentence
 *   plainLatex  how to draw one: a slash becomes a real fraction, ^ a raised power, √ a root with a bar
 */
import { hasTex } from './tex';

const FN = 'arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|log|ln|exp|lim|max|min';
const FN_ONE = new RegExp(`^(?:${FN})$`);
const FN_ALL = new RegExp(FN, 'g');

/* ───────────── drawing one formula ───────────── */

const SYMBOL: Record<string, string> = {
  '−': '-', '–': '-', '*': '\\cdot ', '·': '\\cdot ', '×': '\\times ', '÷': '\\div ', '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '≈': '\\approx ',
  '±': '\\pm ', '∓': '\\mp ', '→': '\\to ', '%': '\\%', '#': '\\#', '&': '\\&', '$': '\\$', '~': '\\sim ',
  '’': "'", '′': "'",
};

interface Tok {
  k: 'num' | 'id' | 'fn' | 'word' | 'diff' | 'op' | 'open' | 'close' | 'sup' | 'sub' | 'slash' | 'sqrt' | 'prime';
  s: string;
  /** A space stood before it. */
  sp: boolean;
}

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let sp = false;
  const push = (k: Tok['k'], s: string) => {
    out.push({ k, s, sp });
    sp = false;
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);
    if (/\s/.test(ch)) {
      sp = true;
      i++;
    } else if (/\d/.test(ch)) {
      const m = /^\d+(?:\.\d+)?/.exec(rest)!;
      push('num', m[0]);
      i += m[0].length;
    } else if (/[A-Za-z]/.test(ch)) {
      const run = /^[A-Za-z]+/.exec(rest)![0];
      i += run.length;
      // "sinx", "lnx": a function name with a letter or two on its tail; "dx": a differential; a longer run is a word
      const fn = new RegExp(`^(${FN})([A-Za-z]{0,2})$`).exec(run);
      if (fn) {
        push('fn', `\\${fn[1]} `);
        for (const c of fn[2]) push('id', c);
      } else if (/^d[a-zθ]$/.test(run)) push('diff', run);
      else if (run.length >= 3) push('word', run);
      else for (const c of run) push('id', c);
    } else if (ch === '∫') {
      push('fn', '\\int ');
      i++;
    } else if (/[α-ωΑ-Ω∞]/.test(ch)) {
      push('id', ch === 'π' ? '\\pi ' : ch === '∞' ? '\\infty ' : ch);
      i++;
    } else if ('([{'.includes(ch)) {
      push('open', ch);
      i++;
    } else if (')]}'.includes(ch)) {
      push('close', ch);
      i++;
    } else if (ch === '^') {
      push('sup', ch);
      i++;
    } else if (ch === '_') {
      push('sub', ch);
      i++;
    } else if (ch === '/') {
      push('slash', ch);
      i++;
    } else if (ch === '√') {
      push('sqrt', ch);
      i++;
    } else if ("'’′".includes(ch)) {
      push('prime', "'");
      i++;
    } else if (rest.startsWith('<=') || rest.startsWith('>=') || rest.startsWith('->') || rest.startsWith('!=')) {
      push('op', { '<=': '\\le ', '>=': '\\ge ', '->': '\\to ', '!=': '\\ne ' }[rest.slice(0, 2)]!);
      i += 2;
    } else {
      push('op', SYMBOL[ch] ?? ch);
      i++;
    }
  }
  return out;
}

interface Node {
  tex: string;
  sp: boolean;
  /** `group`: a bracket still bare, so a fraction can drop it; `op`: a sign, which ends a fraction's top or bottom. */
  kind: 'atom' | 'group' | 'op' | 'slash' | 'name';
  open?: string;
  inner?: string;
  /** The bracket holds one fraction and nothing else: "(2/3)". */
  soleFrac?: boolean;
}

const CLOSER: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

class Reader {
  private at = 0;
  constructor(private toks: Tok[]) {}

  private peek(n = 0): Tok | undefined {
    return this.toks[this.at + n];
  }

  /** Everything up to the bracket that closes this level (or the end). */
  seq(top: boolean): { tex: string; soleFrac: boolean } {
    const nodes: Node[] = [];
    for (let t = this.peek(); t; t = this.peek()) {
      if (t.k === 'close') {
        if (!top) break;
        this.at++;
        nodes.push({ tex: t.s === '}' ? '\\}' : t.s, sp: t.sp, kind: 'op' });
        continue;
      }
      if (t.k === 'slash') {
        this.at++;
        nodes.push({ tex: '/', sp: t.sp, kind: 'slash' });
        continue;
      }
      nodes.push(this.unit());
    }
    return fractions(nodes);
  }

  /** One thing and whatever is raised, lowered or primed on it. */
  private unit(): Node {
    const t = this.peek()!;
    this.at++;
    let node: Node;
    if (t.k === 'open') node = this.group(t);
    else if (t.k === 'sqrt') {
      const next = this.peek();
      if (next && !next.sp && (next.k === 'open' || next.k === 'num' || next.k === 'id' || next.k === 'fn')) {
        this.at++;
        const arg = next.k === 'open' ? this.group(next) : { tex: next.s, sp: false, kind: 'atom' as const };
        node = { tex: `\\sqrt{${arg.kind === 'group' && arg.open === '(' ? arg.inner : arg.tex}}`, sp: t.sp, kind: 'atom' };
      } else node = { tex: '\\surd ', sp: t.sp, kind: 'atom' };
    } else if (t.k === 'word') node = { tex: `\\text{${t.sp ? ' ' : ''}${t.s} }`, sp: t.sp, kind: 'op' };
    else if (t.k === 'diff') node = { tex: `\\,${t.s}`, sp: t.sp, kind: 'atom' };
    else if (t.k === 'op') node = { tex: t.s, sp: t.sp, kind: 'op' };
    else if (t.k === 'sup' || t.k === 'sub' || t.k === 'prime') node = { tex: t.k === 'prime' ? "'" : t.k === 'sub' ? '\\_' : '', sp: t.sp, kind: 'op' };
    else node = { tex: t.s, sp: t.sp, kind: t.k === 'fn' ? 'name' : 'atom' };
    if (node.kind === 'op') return node;

    for (let p = this.peek(); p && !p.sp && (p.k === 'sup' || p.k === 'sub' || p.k === 'prime'); p = this.peek()) {
      this.at++;
      const base = node.kind === 'group' ? bracket(node, true) : node.tex;
      if (p.k === 'prime') {
        node = { ...node, tex: `${base}'`, kind: node.kind === 'name' ? 'name' : 'atom' };
        continue;
      }
      node = { ...node, tex: `${base}${p.s}{${this.arg()}}`, kind: node.kind === 'name' ? 'name' : 'atom' };
    }
    return node;
  }

  /** What a ^ or _ takes: a bracket (shown without it), a signed number or letter, or a root. */
  private arg(): string {
    const t = this.peek();
    if (!t || t.sp) return '';
    if (t.k === 'open') {
      this.at++;
      const g = this.group(t);
      return g.open === '(' || g.open === '{' ? g.inner! : g.tex;
    }
    if (t.k === 'op' && (t.s === '-' || t.s === '+')) {
      const n = this.peek(1);
      if (n && !n.sp && (n.k === 'num' || n.k === 'id')) {
        this.at += 2;
        return t.s + n.s;
      }
      return '';
    }
    if (t.k === 'sqrt') return this.unit().tex;
    if (t.k === 'num' || t.k === 'id' || t.k === 'fn') {
      this.at++;
      return t.s;
    }
    return '';
  }

  private group(open: Tok): Node {
    const inside = this.seq(false);
    const close = this.peek();
    const closed = !!close && close.k === 'close';
    if (closed) this.at++;
    const node: Node = { tex: '', sp: open.sp, kind: 'group', open: open.s, inner: inside.tex, soleFrac: inside.soleFrac };
    node.tex = closed ? bracket(node, true) : `${open.s === '{' ? '\\{' : open.s}${inside.tex}`;
    if (!closed) node.kind = 'atom';
    return node;
  }
}

/** A bracket drawn round its contents; tall ones grow with what they hold. */
function bracket(node: Node, keep: boolean): string {
  if (!keep) return node.inner!;
  const o = node.open!;
  const c = CLOSER[o];
  const tall = /\\frac|\\sqrt|\^\{[^}]*\\frac/.test(node.inner!);
  if (o === '{') return `\\{${node.inner}\\}`;
  return tall ? `\\left${o}${node.inner}\\right${c}` : `${o}${node.inner}${c}`;
}

/**
 * Turns each slash into a fraction. Its top and bottom are whatever is written tight against it:
 * "14/3", "x^2/2", "(x + 1)/(x − 2)", "1/√(1 − x^2)". A bracket that only holds the top or the bottom is dropped.
 */
function fractions(nodes: Node[]): { tex: string; soleFrac: boolean } {
  const list = [...nodes];
  let fracs = 0;
  for (let k = 0; k < list.length; k++) {
    if (list[k].kind !== 'slash') continue;
    const loose = list[k].sp || !!list[k + 1]?.sp;
    let a = k - 1;
    let b = k + 1;
    const solid = (n: Node | undefined) => !!n && n.kind !== 'op' && n.kind !== 'slash';
    if (!solid(list[a]) || !solid(list[b])) continue;
    if (!loose) {
      while (a - 1 >= 0 && !list[a].sp && solid(list[a - 1])) a--;
      while (b + 1 < list.length && !list[b + 1].sp && solid(list[b + 1])) b++;
    }
    const part = (from: number, to: number): string => {
      const one = list[from];
      if (from === to && one.kind === 'group' && one.open === '(') return one.inner!;
      return list.slice(from, to + 1).map((n) => n.tex).join(' ').replace(/^\\,/, '');
    };
    list.splice(a, b - a + 1, { tex: `\\frac{${part(a, k - 1)}}{${part(k + 1, b)}}`, sp: list[a].sp, kind: 'atom' });
    fracs++;
    k = a;
  }
  // "(2/3)(8 − 1)": the bracket was only there to hold the fraction, unless something is applied to it: f(1/2)
  for (let k = 0; k < list.length; k++) {
    const n = list[k];
    const prev = list[k - 1];
    const applied = !!prev && !n.sp && (prev.kind === 'name' || (prev.kind === 'atom' && /[A-Za-z]'*$/.test(prev.tex)));
    if (n.kind === 'group' && n.soleFrac && n.open === '(' && !applied) n.tex = n.inner!;
  }
  const tex = list.map((n) => n.tex).join(' ').replace(/^\\,/, '');
  return { tex, soleFrac: fracs === 1 && list.length === 1 };
}

const cacheTex = new Map<string, string | null>();

/** LaTeX for a formula written as plain text. Null only when there is nothing to draw. */
export function plainLatex(input: string): string | null {
  const hit = cacheTex.get(input);
  if (hit !== undefined) return hit;
  let s = input.trim();
  let tex: string | null = null;
  if (s) {
    // limits said in words: "∫ from 0 to 3 of …", "[…] from 0 to 3"
    s = s.replace(/∫\s*from\s+(\S+)\s+to\s+(\S+)\s+of\b/g, '∫_($1)^($2)').replace(/([\])])\s*from\s+(\S+)\s+to\s+([^\s=]+)/g, '$1_($2)^($3)');
    try {
      tex = new Reader(lex(s)).seq(true).tex.replace(/\s+/g, ' ').trim() || null;
    } catch {
      tex = null;
    }
  }
  if (cacheTex.size > 1500) cacheTex.clear();
  cacheTex.set(input, tex);
  return tex;
}

/* ───────────── finding formulas in a sentence ───────────── */

export interface Run {
  start: number;
  end: number;
}

const MATH_CHARS = /^[0-9A-Za-zα-ωΑ-Ω()[\]{}|^_+\-−–*/·×÷=<>≤≥≠≈±∓√∫∞'’′.,!%→]+$/;
const ENGLISH2 = new Set(['is', 'of', 'to', 'in', 'on', 'as', 'at', 'by', 'we', 'an', 'or', 'if', 'so', 'be', 'it', 'do', 'go', 'no', 'up', 'us', 'my', 'me', 'he', 'am', 'oh', 'ok', 'vs']);
const OP_ONLY = /^[=+\-−–·*/×÷<>≤≥≠≈±→,]+$/;
const NOT_FRACTION = /^(n\/a|w\/o|c\/o|i\/o|\d{1,4}\/\d{1,2}\/\d{1,4})$/i;

/** Can this piece of a sentence be part of a formula? */
function ok(core: string): boolean {
  if (!core) return false;
  if (core.includes('\\')) return true;
  if (!MATH_CHARS.test(core) || /['’][A-Za-z]/.test(core)) return false;
  for (const run of core.replace(FN_ALL, ' ').match(/[A-Za-z]+/g) ?? []) {
    if (run.length >= 3) return false;
    if (run.length === 2 && !/^d[a-z]$/.test(run) && ENGLISH2.has(run.toLowerCase())) return false;
  }
  return true;
}

/** Is this piece maths beyond doubt: a power, a root, an equals sign, a fraction, f(x), f′, LaTeX? */
function strong(core: string): boolean {
  if (core.includes('\\')) return hasTex(core);
  if (/[\^√∫=≤≥≠≈±∞]/.test(core)) return true;
  // a subscript: a_n, x_0, b_(n+1)
  if (/[A-Za-z]_[A-Za-z0-9({]/.test(core)) return true;
  if (/[0-9A-Za-z)\]]\/[0-9A-Za-z(\[√]/.test(core) && !NOT_FRACTION.test(core)) return true;
  if (/^[A-Za-z]['’′]*\([0-9A-Za-z+\-−,.^/ ]*\)/.test(core)) return true;
  return /^[A-Za-z]['’′]+$/.test(core);
}

const cacheRuns = new Map<string, Run[]>();

/**
 * Where the formulas are in a stretch of ordinary text (one that holds no `$…$` of its own).
 * A formula is a run of pieces that can all be maths, with at least one that certainly is; it stops at
 * an ordinary word and at sentence punctuation.
 */
export function mathRuns(text: string): Run[] {
  const hit = cacheRuns.get(text);
  if (hit) return hit;
  const runs: Run[] = [];
  if (/[\\^_→√∫=≤≥≠≈±∞/('’′]/.test(text)) {
    const words: { at: number; core: string; tail: string }[] = [];
    for (const m of text.matchAll(/\S+/g)) {
      const w = m[0];
      // "\\," at the end of a LaTeX piece is a space, not a comma
      const tail = /[.,;:!?]+$/.exec(w.replace(/\\[,;:!]$/, 'xx'))?.[0] ?? '';
      words.push({ at: m.index, core: w.slice(0, w.length - tail.length), tail });
    }
    const word = (i: number) => words[i]?.core ?? '';
    const term = (i: number) => ok(word(i)) && !OP_ONLY.test(word(i));
    // limits said in words carry on a formula: "∫ from 0 to 3 of", "] from 0 to 3"
    const glue = new Set<number>();
    for (let i = 0; i + 3 < words.length; i++) {
      if (word(i + 1) !== 'from' || word(i + 3) !== 'to' || !term(i + 2) || !term(i + 4)) continue;
      if (/∫$/.test(word(i)) && word(i + 5) === 'of' && !words[i + 4].tail) [i + 1, i + 3, i + 5].forEach((k) => glue.add(k));
      else if (/[\])]$/.test(word(i))) [i + 1, i + 3].forEach((k) => glue.add(k));
    }
    const isOk = (i: number) => glue.has(i) || ok(word(i));

    let i = 0;
    while (i < words.length) {
      if (glue.has(i) || !ok(word(i))) {
        i++;
        continue;
      }
      let j = i;
      let depth = 0;
      for (;;) {
        for (const ch of word(j)) depth += ch === '(' || ch === '[' ? 1 : ch === ')' || ch === ']' ? -1 : 0;
        const tail = words[j].tail;
        // a comma inside an open bracket is part of the formula: f(x, y), [0, 3]
        if ((tail && !(tail === ',' && depth > 0)) || j + 1 >= words.length || !isOk(j + 1)) break;
        j++;
      }
      const next = j + 1;
      let a = i;
      let b = j;
      // an article or a sign left hanging at either end is not part of it
      const article = (k: number) => /^[aAI]$/.test(word(k));
      const closesEarly = (k: number) => {
        let d = 0;
        for (const ch of word(k)) if ((d += ch === '(' || ch === '[' ? 1 : ch === ')' || ch === ']' ? -1 : 0) < 0) return true;
        return false;
      };
      while (a < b && (OP_ONLY.test(word(a)) || closesEarly(a) || (article(a) && !/^[=+\-−·*/<>≤≥^]/.test(word(a + 1))))) a++;
      while (b > a && (OP_ONLY.test(word(b)) || glue.has(b) || (article(b) && !/[=+\-−·*/<>≤≥^]$/.test(word(b - 1)) && !FN_ONE.test(word(b - 1))))) b--;
      let sure = false;
      // an arrow between two things is a limit or a mapping: "x → 0", "a_n → L"
      for (let k = a; k <= b && !sure; k++) sure = strong(word(k)) || (FN_ONE.test(word(k)) && k < b && term(k + 1)) || (/^(→|->)$/.test(word(k)) && k > a && k < b);
      if (sure) {
        let start = words[a].at;
        let end = words[b].at + word(b).length;
        // a bracket that belongs to the sentence, not the formula: "(radius x, height h(x)):"
        const balance = () => {
          let d = 0;
          let low = 0;
          for (const ch of text.slice(start, end)) {
            d += ch === '(' || ch === '[' ? 1 : ch === ')' || ch === ']' ? -1 : 0;
            low = Math.min(low, d);
          }
          return { d, low };
        };
        if (!text.slice(start, end).includes('\\')) {
          while (end - start > 1 && balance().low < 0 && /[)\]]/.test(text[end - 1])) end--;
          while (end - start > 1 && balance().d > 0 && /[([]/.test(text[start])) start++;
        }
        if (end - start >= 2 && !OP_ONLY.test(text.slice(start, end))) runs.push({ start, end });
      }
      i = next;
    }
  }
  if (cacheRuns.size > 1500) cacheRuns.clear();
  cacheRuns.set(text, runs);
  return runs;
}
