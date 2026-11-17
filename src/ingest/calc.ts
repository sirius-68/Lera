import { conceptsOfCalc, prepCalc } from '../engine/calc/check';
import { E, ev, has, parseCalc, pending, pre, toText, tryParse } from '../engine/calc/expr';
import { PROMPTS } from '../engine/generate';
import { mathLatex } from '../engine/latex';
import { hasTex } from '../engine/tex';
import { Problem, ProblemKind } from '../engine/types';
import { Block } from './types';

/** Calculus exercises and graphs found in a student's notes. */

const WANTS_DERIVATIVE = /differentiat|derivative|\bd\s*\/\s*d[a-z]\b|\bd[a-z]\s*\/\s*d[a-z]\b|[a-z]\s*'\s*\(|rate of change|производн|дифференцир/i;
const WANTS_INTEGRAL = /∫|integra|antiderivative|primitive|интеграл|проинтегр/i;
const WANTS_LIMIT = /\blim\b|limit|предел/i;

const LEAD = /^(?:(?:find|determine|compute|calculate|evaluate|work\s+out|differentiate|integrate|simplify|use|state|write\s+down|найдите|вычислите)\b[^:=∫]*?\b(?:of|for)\b|(?:differentiate|integrate|evaluate|find|compute|calculate|determine)\b(?:\s+(?:the|each|this|following|function|expression|integral|limit|derivative|with\s+respect\s+to\s+[a-z]))*)\s*[:,]?\s*/i;
const NAMED = /^(?:[a-zA-Z]\s*\(\s*([a-z])\s*\)|[a-zA-Z])\s*=\s*/;
const RANGE = /\s*(?:,|;)?\s*(?:from|between)\s+(?:[a-z]\s*=\s*)?(-?[\w./]+)\s+(?:to|and)\s+(?:[a-z]\s*=\s*)?(-?[\w./]+)\s*$/i;
const WRT = /\s*(?:,|;)?\s*with\s+respect\s+to\s+([a-z])\s*$/i;

function tidy(text: string): string {
  return text
    .replace(/\$/g, '')
    .replace(/[−–]/g, '-')
    .trim()
    .replace(/[.;]\s*$/, '')
    .trim();
}

/** The maths inside a sentence: after the last colon, or what is left once the instruction words are peeled off. */
function candidates(text: string): string[] {
  const out: string[] = [];
  const t = tidy(text);
  if (t.includes(':')) out.push(t.slice(t.lastIndexOf(':') + 1).trim());
  out.push(t.replace(LEAD, ''));
  // drop leading words one at a time: "Find f'(x) if f(x) = …"
  const words = t.split(/\s+/);
  for (let i = 1; i < Math.min(words.length, 9); i++) out.push(words.slice(i).join(' '));
  return [...new Set(out.filter((s) => s.length > 0))];
}

function firstParse(text: string, test: (e: E, raw: string) => boolean): { e: E; v?: string } | null {
  for (const c of candidates(text)) {
    let s = c;
    let v: string | undefined;
    const named = NAMED.exec(s);
    if (named) {
      v = named[1];
      s = s.slice(named[0].length);
    }
    if (!/[a-zA-Z0-9]/.test(s)) continue;
    const e = tryParse(s, v ?? 'x');
    if (e && test(e, s)) return { e, v };
  }
  return null;
}

const soleVariable = (e: E, hint?: string): string => {
  if (hint && has(e, hint)) return hint;
  if (has(e, 'x')) return 'x';
  for (const v of ['t', 'u', 'y', 'z', 's', 'r', 'n', 'w', 'q']) if (has(e, v)) return v;
  return hint ?? 'x';
};

let counter = 0;

/** Where a worked example's own working starts: a new sentence that begins "Let u = …", "Solution", "Using …". */
const WORKING = /[.;!?:]\s+(?=(?:let|solution|using|by|hint|use|set|put|substitut\w*|we\s+(?:have|get|use)|first|step\s*1|пусть|решение|положим|используя|сначала|soit|posons|on\s+pose|en\s+utilisant|solution)\b)/i;
const TO_INF = /^(?:∞|inf|infinity|бесконечност\w*|l[’']infini)$/i;
/** "the limit of X as x approaches a", in words. */
const LIMIT_WORDS = /(?:the\s+)?limit\s+of\s+(.+?)\s+as\s+([a-z])\s*(?:→|->|approaches|tends\s+to|goes\s+to)\s*(-?\s*[\w./∞]+)/i;

/**
 * The question in a line from the notes, without the working that follows it: the text before a sentence that starts
 * the solution ("Let u = …", "Solution", "Using …"), and before an = that follows a whole ∫, d/dx or lim.
 */
export function questionOf(text: string): string {
  let q = text;
  const cut = WORKING.exec(q);
  if (cut && cut.index > 0) q = q.slice(0, cut.index + 1);
  const eq = q.indexOf('=');
  if (eq > 0) {
    const before = q.slice(0, eq);
    const at = before.search(/∫|\blim\b|\bd\s*\/\s*d[a-z]\b/i);
    const e = at >= 0 ? tryParse(tidy(before.slice(at))) : null;
    if (e && pending(e)) q = before;
  }
  return q.trim();
}

/**
 * "Differentiate f(x) = x³ + 2x", "∫ 3x² dx", "Find lim x→2 (x² − 4)/(x − 2)".
 * `inherited` is the instruction above a list ("Evaluate each integral:").
 */
export function buildCalcProblem(text: string, inherited: string | undefined, topicId: string, original: string): Problem | null {
  const whole = `${inherited ?? ''} ${text}`;
  const wantsD = WANTS_DERIVATIVE.test(whole);
  const wantsI = WANTS_INTEGRAL.test(whole);
  const wantsL = WANTS_LIMIT.test(whole);
  if (!wantsD && !wantsI && !wantsL) return null;

  let body = tidy(questionOf(text));
  const lw = LIMIT_WORDS.exec(body);
  if (lw && !/\blim\b/i.test(body)) {
    const to = lw[3].replace(/\s+/g, '');
    body = `lim ${lw[2]}→${TO_INF.test(to) ? '∞' : to} (${tidy(lw[1])})`;
  }
  let range: [string, string] | null = null;
  const rm = RANGE.exec(body);
  if (rm) {
    range = [rm[1], rm[2]];
    body = body.slice(0, rm.index);
  }
  let wrt: string | undefined;
  const wm = WRT.exec(body);
  if (wm) {
    wrt = wm[1];
    body = body.slice(0, wm.index);
  }

  let kind: ProblemKind | null = null;
  let given = '';
  let v = 'x';

  if (/\blim\b/i.test(body)) {
    const at = body.search(/\blim\b/i);
    const e = tryParse(body.slice(at));
    if (e && e.t === 'lim') {
      kind = 'limit';
      v = e.v;
      given = toText(e);
    }
  }
  if (!kind && /∫|\bint\b/.test(pre(body))) {
    const at = body.indexOf('∫');
    const e = tryParse(at >= 0 ? body.slice(at) : body);
    if (e && e.t === 'int') {
      v = e.v;
      const withRange: E = range && !e.lo ? { ...e, lo: parseCalc(range[0]), hi: parseCalc(range[1]) } : e;
      kind = withRange.lo && withRange.hi ? 'definite' : 'integral';
      given = toText(withRange);
    }
  }
  if (!kind && /\bd\s*\/\s*d[a-z]\b/.test(body)) {
    const at = body.search(/\bd\s*\/\s*d[a-z]\b/);
    const e = tryParse(body.slice(at));
    if (e && e.t === 'd') {
      kind = 'derivative';
      v = e.v;
      given = toText(e);
    }
  }
  if (!kind && (wantsD || wantsI) && !(wantsD && wantsI && !inherited)) {
    const found = firstParse(body, (e) => !pending(e) && e.t !== 'n');
    if (found) {
      v = wrt ?? soleVariable(found.e, found.v);
      if (!has(found.e, v)) return null;
      const inner = toText(found.e);
      if (wantsI && !(wantsD && !WANTS_INTEGRAL.test(inherited ?? text))) {
        kind = range ? 'definite' : 'integral';
        given = range ? `∫[${range[0]}, ${range[1]}] ${found.e.t === '+' || found.e.t === 'neg' ? `(${inner})` : inner} d${v}` : `∫ ${found.e.t === '+' || found.e.t === 'neg' ? `(${inner})` : inner} d${v}`;
      } else {
        kind = 'derivative';
        given = `d/d${v}(${inner})`;
      }
    }
  }
  if (!kind) return null;

  const problem: Problem = {
    id: `${topicId}-c${++counter}`,
    kind,
    prompt: PROMPTS[kind],
    given,
    variable: v,
    concepts: [],
    source: 'notes',
    topicId,
    original,
  };
  const prep = prepCalc(problem);
  if (!prep) return null;
  if ((kind === 'definite' || kind === 'limit') && prep.value === undefined) return null;
  problem.concepts = conceptsOfCalc(problem);
  return problem;
}

/* ───────────── graphs ───────────── */

const GRAPH_WORDS = /\b(graph|sketch|plot|curve|parabola|figure|fig\.|diagram|drawn|shown|axes|intercept|asymptote|tangent|turning point|vertex|график|кривая|парабол)\b/i;
const FN_DEF = /(?:^|[\s,(;:])(?:[yY]|[a-zA-Z]\s*\(\s*x\s*\))\s*=\s*([^,;:]+?)(?=$|[,;:]|\.\s|\.$|\s+(?:is|are|has|and|for|with|where|when|on|at|in|shown|crosses|cuts|meets|passes|from|between|—|–)\b)/g;

/** Can this be drawn as y = f(x)? */
export function plottable(src: string): string | null {
  const e = tryParse(src.replace(/\$/g, '').replace(/[.]\s*$/, ''));
  if (!e || pending(e) || !has(e, 'x')) return null;
  // no stray letters other than constants
  let finite = 0;
  for (const x of [-2.3, -1.1, 0.4, 1.7, 2.9]) {
    try {
      if (Number.isFinite(ev(e, { x }))) finite++;
    } catch {
      return null;
    }
  }
  return finite >= 2 ? toText(e) : null;
}

/** Functions a sentence names for drawing: "The graph of y = x² − 4 is a parabola." → ["x^2 - 4"]. */
export function graphFunctions(text: string, force = false): string[] {
  const t = text.replace(/\$/g, '').replace(/[−–]/g, '-');
  if (!force && !GRAPH_WORDS.test(t)) return [];
  const out: string[] = [];
  for (const m of t.matchAll(FN_DEF)) {
    const f = plottable(m[1].trim());
    if (f && !out.includes(f)) out.push(f);
  }
  return out.slice(0, 3);
}

/** A display equation that is itself a function of x: "y = 2x + 1", "f(x) = sin x". */
export function functionOfLine(text: string): string | null {
  const m = /^\s*(?:[yY]|[a-zA-Z]\s*\(\s*x\s*\))\s*=\s*(.+)$/.exec(text.replace(/\$/g, '').replace(/[−–]/g, '-'));
  return m ? plottable(m[1]) : null;
}

/* ───────────── maths inside a sentence ───────────── */

const OP = /^[+\-−–·*/=<>≤≥]$/;
const ENGLISH = new Set(['a', 'i', 'is', 'of', 'to', 'in', 'on', 'as', 'at', 'by', 'we', 'an', 'or', 'if', 'so', 'be', 'it', 'the', 'and', 'for', 'are', 'has', 'not', 'but', 'can', 'its']);
const TERM = /^[0-9a-zA-Z()^.]{1,14}$/;

/**
 * Files without equation objects (PDFs, plain text) carry their maths as bare text: "the form ax^2 + bx + c = 0".
 * Wrap each run that contains a power in $…$ so the lesson typesets it. Only runs the engine can read are wrapped.
 */
export function markInlineMath(text: string): string {
  if (text.includes('$') || !text.includes('^') || hasTex(text)) return text;
  const words = text.split(' ');
  const strip = (w: string): string => w.replace(/[.,;:!?]+$/, '');
  const isTerm = (w: string): boolean => TERM.test(w) && !ENGLISH.has(w.toLowerCase()) && (w.includes('^') || /^[0-9.]+$/.test(w) || /^[0-9]*[a-zA-Z]{1,3}$/.test(w) || /^\(?[0-9a-zA-Z^+\-−]+\)?$/.test(w));
  const used = new Array<boolean>(words.length).fill(false);
  const out: { from: number; to: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    if (used[i] || !strip(words[i]).includes('^') || !/^[0-9a-zA-Z()^+\-−–·*/=.]+$/.test(strip(words[i]))) continue;
    let from = i;
    let to = i;
    // grow leftwards over "term op", rightwards over "op term" — stop at sentence punctuation
    while (from >= 2 && OP.test(words[from - 1]) && isTerm(words[from - 2]) && !used[from - 2]) from -= 2;
    while (to + 2 < words.length && words[to] === strip(words[to]) && OP.test(words[to + 1]) && (isTerm(strip(words[to + 2])) || strip(words[to + 2]).includes('^'))) to += 2;
    for (let k = from; k <= to; k++) used[k] = true;
    out.push({ from, to });
  }
  if (!out.length) return text;
  const parts: string[] = [];
  let at = 0;
  for (const g of out) {
    parts.push(...words.slice(at, g.from));
    const last = words[g.to];
    const tail = last.slice(strip(last).length);
    const body = [...words.slice(g.from, g.to), strip(last)].join(' ');
    parts.push(mathLatex(body.replace(/[−–]/g, '-').replace(/·/g, '*')) !== null ? `$${body}$${tail}` : `${body}${tail}`);
    at = g.to + 1;
  }
  parts.push(...words.slice(at));
  return parts.join(' ');
}

/**
 * The same finishing touches for blocks from any source (the built-in reader or an AI model):
 * typeset the powers in prose and put a graph under each sentence that names a function to draw.
 */
export function enrichBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  const drawn = new Set(blocks.filter((b): b is Extract<Block, { t: 'graph' }> => b.t === 'graph').map((b) => b.fns.join('|')));
  for (const b of blocks) {
    if (b.t === 'p' || b.t === 'note') {
      out.push({ ...b, text: markInlineMath(b.text) });
      const fns = b.t === 'p' ? graphFunctions(b.text) : [];
      if (fns.length && !drawn.has(fns.join('|'))) {
        drawn.add(fns.join('|'));
        out.push({ t: 'graph', text: '', fns });
      }
    } else if (b.t === 'list') out.push({ ...b, items: b.items.map(markInlineMath) });
    else out.push(b);
  }
  return out;
}
