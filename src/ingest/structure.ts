import { Statement, statementToText, statementVars, walk, Node } from '../engine/ast';
import { cleanTex, hasTex, isTexLine, markTex } from '../engine/tex';
import { finalForm, isCollected, prepare } from '../engine/check';
import { cleanPath } from '../engine/analyze';
import { CONCEPTS, conceptsForText } from '../engine/concepts';
import { buildCalcProblem, graphFunctions, markInlineMath } from './calc';
import { PROMPTS } from '../engine/generate';
import { parseLine } from '../engine/parse';
import { ConceptId, Problem, ProblemKind } from '../engine/types';
import { GLOSSARY } from './glossary';
import { repairFlatPowers, slug, toMathText } from './text';
import { Block, LeraDoc, RawDoc, RawPara, Topic, Unit } from './types';

/**
 * Turn a flat run of paragraphs into units → topics → blocks, and lift the
 * exercises out into Practice. Entirely rule-based: it runs offline, instantly,
 * and is what the app falls back to when no AI key is configured.
 */

const HEADING_WORD = /^(chapter|unit|section|lesson|topic|part|module|глава|раздел|тема|урок)\s+\d+/i;
const NUM_HEADING = /^(\d{1,2})((?:\.\d{1,2})*)\.?\s+(\S.*)$/;
const EXERCISE_HEAD =
  /^(?:\d+(?:\.\d+)*\.?\s+)?(exercises?|practice(\s+(problems|questions|exercises))?|problems?|questions?|try\s+(it|these)(\s+yourself)?|your\s+turn|now\s+you\s+try|homework|review(\s+questions)?|check\s+your\s+understanding|self[- ]?test|quiz|упражнения|задачи|задания)\b[\s:.\d–-]*$/i;
const EXERCISE_LEAD = /^(exercise|problem|question|q|упражнение|задача)\s*\d+\s*[.:)–-]?\s*/i;
const EXAMPLE_LEAD = /^((?:worked\s+)?example|пример)\s*(\d+)?\s*[:.)–-]?\s*/i;
const NOTE_LEAD = /^(definition|note|remember|key\s+idea|key\s+point|rule|tip|important|recall|property|theorem|правило|определение|запомни)\s*[:.–-]\s*/i;
const VERB =
  /^(solve|simplify|factor(?:ise|ize)?|expand|evaluate|calculate|work\s+out|find|determine|compute|multiply\s+out|reduce|write|differentiate|integrate|sketch|продифференцируйте|проинтегрируйте|решите|упростите|разложите|вычислите|найдите|раскройте)\b/i;
const NUMBERING = /^(?:\(?\d{1,2}[.)]|\(?[a-hA-H][.)]|\([ivx]{1,4}\)|[•▪◦●○■□➢➤✓–—-])\s+/;
const MATH_WORDS = new Set(['sqrt', 'and', 'or', 'abs']);

/** Text with the $…$ maths markers removed. */
export const plain = (text: string): string => text.replace(/[$\u2063]/g, '');

export function isMathLine(text: string): boolean {
  const t = toMathText(plain(text)).replace(/[.;,]+$/, '');
  if (t.length < 3 || t.length > 120) return false;
  if (!/[=<>+\-*/^]/.test(t)) return false;
  const words = t.match(/[A-Za-z]{2,}/g) ?? [];
  if (words.some((w) => !MATH_WORDS.has(w.toLowerCase()) && w.length >= 3)) return false;
  return parseLine(t).ok;
}

interface Extracted {
  given: string;
  st: Statement;
  subs?: Record<string, string>;
}

const SUBS = /[,;]?\s*\b(?:when|if|for|given(?:\s+that)?|where|at|при)\s+([a-z])\s*=\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)(?:\s*(?:,|and|и)\s*([a-z])\s*=\s*(-?\d+(?:\.\d+)?(?:\/\d+)?))?\s*\.?$/i;

/** Find the maths inside a sentence like "Solve for x: 3x + 4 = 19." */
export function extractMath(text: string): Extracted | null {
  // maths that the source file itself marked as an equation is the best candidate
  const marked = [...text.matchAll(/\$([^$]+)\$/g)].map((mm) => mm[1].trim());
  let t = plain(text).trim().replace(/[−–]/g, '-').replace(NUMBERING, '').replace(EXERCISE_LEAD, '');
  let subs: Record<string, string> | undefined;
  const sm = SUBS.exec(t);
  if (sm) {
    subs = { [sm[1]]: sm[2] };
    if (sm[3] && sm[4]) subs[sm[3]] = sm[4];
    t = t.slice(0, sm.index).trim();
  }
  const attempts: string[] = [];
  const subsText = sm ? sm[0] : '';
  for (const seg of [...marked].sort((x, y) => y.length - x.length)) {
    // skip the "x = 2" that belongs to a "when x = 2" clause
    if (subsText && plain(subsText).replace(/\s/g, '').includes(seg.replace(/[−–]/g, '-').replace(/\s/g, ''))) continue;
    attempts.push(seg);
  }
  if (t.includes(':')) attempts.push(t.slice(t.lastIndexOf(':') + 1));
  // peel words off the front and back until what is left is maths
  const tokens = t.split(/\s+/);
  const isWord = (w: string) => /^[A-Za-zА-Яа-яЁё’'-]{2,}[,.:;]?$/.test(w) && !MATH_WORDS.has(w.toLowerCase().replace(/[,.:;]$/, ''));
  let a = 0;
  let b = tokens.length;
  while (a < b && (isWord(tokens[a]) || /^[a-z]$/i.test(tokens[a]) && a + 1 < b && isWord(tokens[a + 1]) || /^[,.:;]$/.test(tokens[a]))) a++;
  while (b > a && isWord(tokens[b - 1])) b--;
  // "... for x" / "... for x." at the end
  if (b - a >= 3 && /^(for|in)$/i.test(tokens[b - 2]) && /^[a-z][.]?$/i.test(tokens[b - 1])) b -= 2;
  attempts.push(tokens.slice(a, b).join(' '));
  // last resort: the longest run of maths-looking characters
  const runs = t.match(/[-+*/^=<>≤≥()0-9a-z\s.,√²³⁴|−–×÷·]{3,}/gi) ?? [];
  runs.sort((x, y) => y.length - x.length);
  attempts.push(...runs.slice(0, 2));

  for (const raw of attempts) {
    const cand = toMathText(raw).replace(/^[\s,.;:]+|[\s,.;:]+$/g, '');
    if (cand.length < 2 || !/[0-9a-z]/i.test(cand)) continue;
    if (!/[=<>+\-*/^(]/.test(cand)) continue;
    const words = cand.match(/[A-Za-z]{3,}/g) ?? [];
    if (words.some((w) => !MATH_WORDS.has(w.toLowerCase()))) continue;
    const p = parseLine(cand);
    if (p.ok) return { given: cand, st: p.st, subs };
  }
  return null;
}

function anyNode(st: Statement, test: (n: Node) => boolean): boolean {
  const roots: Node[] = st.kind === 'expr' ? [st.expr] : st.kind === 'rel' ? st.rels.flatMap((r) => [r.lhs, r.rhs]) : [];
  let hit = false;
  for (const r of roots) walk(r, (x) => {
    if (test(x)) hit = true;
  });
  return hit;
}

const hasBrackets = (st: Statement) => anyNode(st, (n) => (n.t === 'mul' && n.args.some((a) => a.t === 'add')) || (n.t === 'neg' && n.arg.t === 'add'));
const twoBrackets = (st: Statement) => anyNode(st, (n) => (n.t === 'mul' && n.args.filter((a) => a.t === 'add').length >= 2) || (n.t === 'pow' && n.base.t === 'add'));
const hasFractions = (st: Statement) => anyNode(st, (n) => n.t === 'div');
const hasPowers = (st: Statement) => anyNode(st, (n) => n.t === 'pow');

function conceptsFor(kind: ProblemKind, st: Statement): ConceptId[] {
  const out: ConceptId[] = [];
  const add = (c: ConceptId) => {
    if (!out.includes(c)) out.push(c);
  };
  switch (kind) {
    case 'linear':
    case 'equation':
      if (hasFractions(st)) add('clearing-fractions');
      if (hasBrackets(st)) add('distributive');
      add('inverse-operations');
      add('balance');
      break;
    case 'quadratic': {
      if (hasBrackets(st) || twoBrackets(st)) {
        add('zero-product');
        break;
      }
      const p = prepare({ id: 'x', kind: 'quadratic', prompt: '', given: statementToText(st), concepts: [], source: 'notes' });
      const roots = p?.solution?.roots ?? [];
      const exact = roots.every((r) => r.exact);
      const mirrored = roots.length === 2 && roots[0].value === -roots[1].value;
      if (!exact) add('quadratic-formula');
      else if (mirrored) add('square-root-pm');
      else if (roots.some((r) => r.value === 0)) {
        add('dividing-by-variable');
        add('factoring');
      } else {
        add('factoring');
        add('zero-product');
      }
      break;
    }
    case 'inequality':
      add('inequality-flip');
      add('inverse-operations');
      break;
    case 'simplify':
      if (hasBrackets(st)) add('distributive');
      if (hasPowers(st) && anyNode(st, (n) => n.t === 'mul' || n.t === 'div' || (n.t === 'pow' && n.base.t !== 'var' && n.base.t !== 'num'))) add('exponent-rules');
      if (hasFractions(st)) add('fractions');
      add('like-terms');
      break;
    case 'expand':
      add(twoBrackets(st) ? 'expanding-binomials' : 'distributive');
      add('like-terms');
      break;
    case 'factor':
      add('factoring');
      break;
    case 'evaluate':
      add('order-of-operations');
      if (anyNode(st, (n) => n.t === 'neg')) add('signed-arithmetic');
      if (hasFractions(st)) add('fractions');
      break;
    case 'system':
      add('systems');
      break;
    default:
      break;
  }
  return out;
}

function verbKind(verb: string | undefined): ProblemKind | undefined {
  if (!verb) return undefined;
  const v = verb.toLowerCase();
  if (/^factor|^разлож/.test(v)) return 'factor';
  if (/^expand|^multiply|^раскр/.test(v)) return 'expand';
  if (/^simplif|^reduce|^упрост/.test(v)) return 'simplify';
  if (/^evaluat|^calculat|^work|^comput|^вычисл/.test(v)) return 'evaluate';
  return undefined;
}

let exerciseCounter = 0;

/** One exercise from one piece of text, or null if there is no exercise in it. */
export function buildProblem(text: string, inherited: string | undefined, topicId: string): Problem | null {
  const clean = text.trim().replace(NUMBERING, '').replace(EXERCISE_LEAD, '').trim();
  if (plain(clean).length < 2) return null;
  const ownVerb = VERB.exec(clean)?.[1];
  const verb = ownVerb ?? (inherited ? VERB.exec(inherited.trim())?.[1] : undefined);
  const original = inherited && !ownVerb ? `${plain(inherited).replace(/[:.]\s*$/, '')}: ${clean}` : clean;
  // calculus first: d/dx, ∫ and lim never parse as algebra
  const calc = buildCalcProblem(repairFlatPowers(clean), ownVerb ? undefined : inherited, topicId, original);
  if (calc) return calc;
  // powers that arrived flattened ("x2 − 5x + 6 = 0") are repaired before the algebra is read
  // "12x^7 / 4x^3" in notes means the whole 4x^3 is underneath
  const repaired = repairFlatPowers(clean).replace(/\s\/\s*(\d+(?:[a-z](?:\^\(?-?\d+\)?)?)+)(?=\s|[.,;]|$)/g, ' / ($1)');
  const ex = (repaired !== clean ? extractMath(repaired) : null) ?? extractMath(clean);
  const id = `${topicId}-e${++exerciseCounter}`;

  const open = (): Problem => ({
    id,
    kind: 'open',
    prompt: original,
    given: '',
    concepts: conceptsForText(original).slice(0, 2),
    source: 'notes',
    topicId,
    original,
  });

  if (!ex) return verb && clean.split(/\s+/).length >= 3 ? open() : null;

  const vars = statementVars(ex.st);
  let kind: ProblemKind | undefined;
  if (ex.st.kind === 'rel') {
    const allEq = ex.st.rels.every((r) => r.op === '=');
    if (allEq && ex.st.rels.length >= 2 && vars.size >= 2) kind = 'system';
    else if (allEq && ex.st.rels.length === 1 && vars.size === 1) kind = 'equation';
    else if (!allEq && vars.size === 1) kind = 'inequality';
    else return verb ? open() : null;
  } else if (ex.st.kind === 'expr') {
    kind = verbKind(verb);
    if (!kind) {
      if (verb && /^solve|^реш/i.test(verb)) return open();
      if (vars.size === 0 || ex.subs) kind = 'evaluate';
      else if (verb && /^find|^determine|^найд/i.test(verb)) return open();
      else kind = hasBrackets(ex.st) || twoBrackets(ex.st) ? 'expand' : 'simplify';
    }
    if (kind === 'evaluate' && vars.size > 0 && !ex.subs) kind = 'simplify';
  } else return null;

  let problem: Problem = {
    id,
    kind,
    prompt: PROMPTS[kind],
    given: statementToText(ex.st).replace(/[≤]/g, '<=').replace(/[≥]/g, '>='),
    subs: ex.subs,
    concepts: [],
    source: 'notes',
    topicId,
    original,
  };
  let prep = prepare(problem);
  if (!prep) return verb ? open() : null;

  if (kind === 'equation') {
    const n = prep.solution?.kind === 'finite' ? prep.solution.roots.length : 0;
    const quadratic = anyNode(ex.st, (x) => x.t === 'pow') || twoBrackets(ex.st) || n >= 2;
    problem = { ...problem, kind: quadratic ? 'quadratic' : 'linear' };
    problem.prompt = `Solve for ${prep.v}`;
    problem.variable = prep.v;
    prep = prepare(problem);
    if (!prep) return open();
  }
  if (kind === 'inequality') problem.variable = prep.v;
  if (kind === 'evaluate' && ex.subs) {
    problem.prompt = `Evaluate when ${Object.entries(ex.subs).map(([k, v]) => `${k} = ${v}`).join(', ')}`;
  }

  // a line that is already an answer isn't an exercise — it's a statement in the notes
  if (finalForm(prep, ex.st).final && problem.kind !== 'system') return null;
  if ((problem.kind === 'simplify' || problem.kind === 'expand') && ex.st.kind === 'expr' && isCollected(ex.st.expr)) return null;
  if (cleanPath(problem).length === 0) return verb ? open() : null;

  problem.concepts = conceptsFor(problem.kind, ex.st);
  return problem;
}

/** A paragraph may hold several parts: "Solve: (a) 2x = 6 (b) x + 3 = 7". */
function splitParts(text: string): { lead?: string; parts: string[] } {
  const marker = /(?:^|\s)\(?([a-h])\)\s+/g;
  const hits: { index: number; len: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = marker.exec(text))) hits.push({ index: m.index, len: m[0].length });
  if (hits.length >= 2) {
    const lead = text.slice(0, hits[0].index).trim();
    const parts = hits.map((h, i) => text.slice(h.index + h.len, hits[i + 1]?.index ?? text.length).trim());
    return { lead: lead || undefined, parts };
  }
  const semi = text.split(/\s*;\s+/).filter(Boolean);
  if (semi.length >= 2 && semi.every((s) => isMathLine(s))) return { parts: semi };
  return { parts: [text] };
}

/**
 * Marks the maths inside a line of prose so it is drawn. A line with LaTeX in it keeps its LaTeX exactly
 * (a whole-line formula is left for the reader to set on its own); other lines get their powers and
 * fractions marked the usual way.
 */
const FN_NAMES = /\b(arc(sin|cos|tan)|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|ln|log|exp|sqrt|lim|dx|dy|du|dv|dt)\b/g;
/** A table cell that holds nothing but a formula ("1/√(1 − x^2)", "ln|sec x|") is typeset whole. */
function cellMath(cell: string): string {
  if (hasTex(cell) || cell.includes('$')) return inlineMath(cell);
  const rest = cell.replace(FN_NAMES, ' ');
  const formula = !/[A-Za-z]{2,}/.test(rest) && (rest !== cell || /[=+−\-*/^√|<>≤≥]/.test(cell) || /\d[A-Za-z]|[A-Za-z]\d/.test(cell));
  return formula ? `$${cell}$` : inlineMath(cell);
}

function inlineMath(text: string): string {
  if (!hasTex(text)) return markInlineMath(text);
  return isTexLine(plain(text)) ? text : markTex(text);
}

/** The problems in a line of text: "Solve 3x + 2 = 11", or several parts (a) (b) (c) under one instruction. */
export function parseExercises(text: string, inherited: string | undefined, topicId: string): { problems: Problem[]; instruction?: string } {
  const { lead, parts } = splitParts(text);
  const instruction = lead && VERB.test(lead.replace(NUMBERING, '').replace(EXERCISE_LEAD, '')) ? lead.replace(NUMBERING, '').replace(EXERCISE_LEAD, '') : inherited;
  const problems: Problem[] = [];
  for (const part of parts) {
    const p = buildProblem(part, instruction, topicId);
    if (p) problems.push(p);
  }
  return { problems, instruction: lead ? instruction : undefined };
}

type Role = 'title' | 'unit' | 'topic' | 'sub' | 'exercises' | 'content';

interface Tagged {
  para: RawPara;
  role: Role;
  level?: number;
  text: string;
}

function headingLevel(p: RawPara): number | undefined {
  const text = p.text;
  if (p.list) return undefined;
  if (p.level !== undefined) return p.level;
  if (text.length > 110) return undefined;
  if (HEADING_WORD.test(text)) return 1;
  const stripped = text.replace(NUMBERING, '');
  if (VERB.test(stripped) && extractMath(text)) return undefined;
  if (isMathLine(text)) return undefined;
  if (p.bold && text.length <= 80 && !/[.;,]$/.test(text) && !EXAMPLE_LEAD.test(text) && !NOTE_LEAD.test(text)) return 3;
  const nm = NUM_HEADING.exec(text);
  if (nm && text.length <= 80 && !/[.;,?]$/.test(text) && /^[A-ZА-ЯЁ]/.test(nm[3]) && !/[=<>]/.test(text) && nm[3].split(/\s+/).length <= 9) {
    const depth = nm[2] ? nm[2].split('.').length : 1;
    return Math.min(3, depth);
  }
  const letters = text.replace(/[^A-Za-zА-Яа-яЁё]/g, '');
  if (letters.length >= 6 && text.length <= 60 && text === text.toUpperCase() && /[A-ZА-ЯЁ]{3,}/.test(text)) return 2;
  return undefined;
}

function titleCase(s: string): string {
  if (s !== s.toUpperCase() || s.length < 4) return s;
  return s.toLowerCase().replace(/(^|[\s(-])([a-zа-яё])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

function cleanHeading(s: string): string {
  return titleCase(s.replace(/^(\d{1,2}(?:\.\d{1,2})*)\.?\s+/, '').replace(/\s*[:.]$/, '').trim());
}

function fileTitle(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? base[0].toUpperCase() + base.slice(1) : 'My notes';
}

function harvestGlossary(paras: RawPara[]): Record<string, string> {
  const out: Record<string, string> = {};
  const patterns = [
    /\b(?:An?|The)\s+([a-z][a-z -]{2,28}?)\s+is\s+((?:an?|the|any|when)\s+[^.]{12,170})\./g,
    /\b([A-Z][a-z]+(?:\s+[a-z]+){0,2})\s+(?:are|means)\s+([^.]{12,170})\./g,
  ];
  for (const p of paras) {
    if (p.text.length > 400) continue;
    const text = plain(p.text);
    for (const re of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const term = m[1].trim().toLowerCase();
        if (term.split(/\s+/).length > 3 || term.length < 4) continue;
        if (/^(this|that|it|there|here|answer|result|solution|next|first|second|last|following)$/.test(term)) continue;
        if (!out[term]) out[term] = m[0].trim();
      }
    }
  }
  return out;
}

export function structureDoc(raw: RawDoc, now: Date = new Date()): LeraDoc {
  exerciseCounter = 0;
  const paras = raw.paras.filter((p) => p.text && p.text.trim().length > 0);
  const warnings: string[] = [];

  // 1. tag every paragraph
  const tagged: Tagged[] = paras.map((para) => {
    if (EXERCISE_HEAD.test(para.text) && para.text.length <= 60) return { para, role: 'exercises', text: para.text };
    const level = headingLevel(para);
    if (level === undefined) return { para, role: 'content', text: para.text };
    return { para, role: level === 0 ? 'title' : 'content', level, text: para.text };
  });

  // 2. decide what each heading level means in this document
  let title = raw.title ?? tagged.find((t) => t.role === 'title')?.text;
  let levels = [...new Set(tagged.filter((t) => t.level !== undefined && t.level > 0).map((t) => t.level as number))].sort((a, b) => a - b);
  if (levels.length >= 2) {
    const top = tagged.filter((t) => t.level === levels[0]);
    if (top.length === 1 && !title && tagged.indexOf(top[0]) <= 2) {
      // a lone top-level heading at the start is the document title
      title = top[0].text;
      top[0].role = 'title';
      top[0].level = 0;
      levels = levels.slice(1);
    }
  }
  const roleOf = (level: number): Role => {
    const i = levels.indexOf(level);
    if (levels.length === 1) return 'topic';
    if (i === 0) return 'unit';
    if (i === 1) return 'topic';
    return 'sub';
  };
  for (const t of tagged) if (t.level !== undefined && t.level > 0 && t.role === 'content') t.role = roleOf(t.level);
  title = cleanHeading(title ?? fileTitle(raw.fileName));

  // 3. build the tree
  const units: Unit[] = [];
  let unit: Unit | null = null;
  let topic: Topic | null = null;
  let inExercises = false;
  let inExample: Extract<Block, { t: 'example' }> | null = null;
  let instruction: string | undefined;
  let instructionLive = false;

  let load = 0;
  let baseTitle = '';
  let partNo = 1;
  const ensureUnit = (): Unit => {
    if (!unit) {
      unit = { id: `u${units.length + 1}`, title, topics: [] };
      units.push(unit);
    }
    return unit;
  };
  const ensureTopic = (): Topic => {
    if (!topic) {
      const u = ensureUnit();
      const name = u.topics.length === 0 ? (u.title === title ? 'Introduction' : 'Overview') : `Part ${u.topics.length + 1}`;
      topic = { id: `${u.id}t${u.topics.length + 1}`, title: name, blocks: [], exercises: [], concepts: [] };
      u.topics.push(topic);
      load = 0;
      baseTitle = name;
      partNo = 1;
    }
    return topic;
  };
  const resetFlow = () => {
    inExercises = false;
    inExample = null;
    instruction = undefined;
    instructionLive = false;
  };
  /**
   * A lesson is something to finish in one sitting. A long section becomes several lessons: at its next
   * sub-heading once it has grown past LESSON_SOFT, or, with no sub-heading to break at, at a paragraph
   * once past LESSON_HARD. (About 1,250 characters fill a phone page: these are roughly 4 and 9 pages.)
   */
  const LESSON_SOFT = 4500;
  const LESSON_HARD = 11000;
  const startTopic = (name: string, continued = false): Topic => {
    const u = ensureUnit();
    topic = { id: `${u.id}t${u.topics.length + 1}`, title: name, blocks: [], exercises: [], concepts: [] };
    u.topics.push(topic);
    load = 0;
    if (!continued) {
      baseTitle = name;
      partNo = 1;
    }
    return topic;
  };
  const pushBlock = (raw: Block) => {
    if (topic && load > LESSON_HARD && raw.t === 'p' && !inExample) {
      partNo += 1;
      startTopic(`${baseTitle} · part ${partNo}`, true);
    }
    const t = ensureTopic();
    load += raw.t === 'list' ? raw.items.join(' ').length + 60 : raw.t === 'example' ? 400 : raw.t === 'graph' ? 500 : raw.t === 'table' ? raw.rows.length * 60 : raw.text.length + 40;
    // prose from files without equation objects: typeset the powers it mentions
    const b: Block =
      raw.t === 'p' || raw.t === 'note' ? { ...raw, text: inlineMath(raw.text) } : raw.t === 'list' ? { ...raw, items: raw.items.map(inlineMath) } : raw;
    const last = t.blocks[t.blocks.length - 1];
    if (b.t === 'list' && last && last.t === 'list' && last.ordered === b.ordered) last.items.push(...b.items);
    else t.blocks.push(b);
  };

  const drawn = new Set<string>();
  let pendingFigure: { fns: string[]; caption: string } | null = null;
  for (let i = 0; i < tagged.length; i++) {
    const tg = tagged[i];
    const text = tg.text;
    if (tg.role === 'title') continue;
    if (tg.role === 'unit') {
      unit = { id: `u${units.length + 1}`, title: cleanHeading(text), topics: [] };
      units.push(unit);
      topic = null;
      resetFlow();
      continue;
    }
    if (tg.role === 'topic') {
      startTopic(cleanHeading(text));
      resetFlow();
      continue;
    }
    if (tg.role === 'exercises') {
      ensureTopic();
      resetFlow();
      inExercises = true;
      continue;
    }
    if (tg.role === 'sub') {
      resetFlow();
      // a sub-heading inside a lesson that is already long starts the next lesson
      if (topic && load > LESSON_SOFT) startTopic(cleanHeading(text));
      else pushBlock({ t: 'h', text: cleanHeading(text) });
      continue;
    }

    const t = ensureTopic();
    const bare = text.replace(NUMBERING, '');

    // inside an exercise section everything is an exercise or an instruction for the ones that follow
    if (inExercises) {
      // "Expand and simplify." / "Solve each equation:" set the task for the items that follow
      const short = bare.split(/\s+/).length <= 7;
      if (VERB.test(bare) && !extractMath(text) && (short || /:$/.test(text) || /\b(following|each|these|below)\b/i.test(text))) {
        instruction = bare;
        continue;
      }
      const res = parseExercises(text, instruction, t.id);
      if (res.problems.length) {
        t.exercises.push(...res.problems);
        if (res.instruction) instruction = res.instruction;
      } else if (VERB.test(bare) || /:$/.test(text)) {
        instruction = bare;
      }
      continue;
    }

    if (EXERCISE_LEAD.test(text)) {
      const res = parseExercises(text, undefined, t.id);
      if (res.problems.length) {
        t.exercises.push(...res.problems);
        inExample = null;
        continue;
      }
    }

    if (tg.para.table) {
      const rows = tg.para.table.map((r) => r.map(cellMath));
      // a first row of plain words is the heading row; a first row of values is just the first row
      pushBlock({ t: 'table', rows, head: tg.para.table[0].every((c) => !/[\d=+^/|√]/.test(c)) });
      continue;
    }
    const exm = EXAMPLE_LEAD.exec(text);
    if (exm) {
      const rest = text.slice(exm[0].length).trim();
      inExample = { t: 'example', title: exm[2] ? `Example ${exm[2]}` : 'Example', lines: rest ? [inlineMath(rest)] : [] };
      pushBlock(inExample);
      instructionLive = false;
      continue;
    }

    const tex = isTexLine(plain(text));
    const mathy = !!tg.para.math || tex || isMathLine(text);

    const note = NOTE_LEAD.exec(text);

    if (inExample) {
      const worked = /^(solution|answer|step|so|therefore|then|check|hence|решение|ответ)\b/i.test(text);
      const keep = !note && !VERB.test(bare) && (mathy || worked || text.length <= 110);
      if (keep && inExample.lines.length < 14) {
        inExample.lines.push(...(tg.para.rows ?? [text]).map(inlineMath));
        continue;
      }
      inExample = null;
    }

    if (note) {
      const label = note[1][0].toUpperCase() + note[1].slice(1).toLowerCase();
      pushBlock({ t: 'note', label, text: text.slice(note[0].length).trim() });
      instructionLive = false;
      continue;
    }

    // "Solve the following:" followed by a list of items
    if (VERB.test(bare) && (/:$/.test(text) || /\bfollowing\b|\beach\b/i.test(text)) && !extractMath(text)) {
      instruction = bare;
      instructionLive = true;
      continue;
    }
    if (instructionLive && (tg.para.list || mathy || NUMBERING.test(text))) {
      const res = parseExercises(text, instruction, t.id);
      if (res.problems.length) {
        t.exercises.push(...res.problems);
        continue;
      }
    }
    if (instructionLive && !tg.para.list && !mathy) instructionLive = false;

    // a stand-alone instruction with its own maths: "Simplify 3x + 2x − 5."
    if (VERB.test(bare) && text.length <= 160) {
      // in running text only keep what can actually be checked; prose that starts with a verb stays prose
      const found = parseExercises(text, undefined, t.id).problems.filter((e) => e.kind !== 'open');
      if (found.length) {
        t.exercises.push(...found);
        continue;
      }
    }

    if (tg.para.list) {
      pushBlock({ t: 'list', ordered: tg.para.list === 'number', items: [bare] });
      continue;
    }
    if (tg.para.figure) {
      // a picture in the file: rebuild it from the function its caption (or the text beside it) names
      const near = [tagged[i + 1], tagged[i - 1], tagged[i + 2], tagged[i - 2]].filter((x) => x && !x.para.figure && x.role === 'content');
      for (const n of near) {
        const fns = graphFunctions(n.text, true);
        if (fns.length) {
          pendingFigure = { fns, caption: /^(fig|figure|graph|рис)/i.test(n.text) ? n.text : '' };
          break;
        }
      }
      if (pendingFigure && !drawn.has(pendingFigure.fns.join('|'))) {
        drawn.add(pendingFigure.fns.join('|'));
        pushBlock({ t: 'graph', text: pendingFigure.caption, fns: pendingFigure.fns });
      }
      pendingFigure = null;
      continue;
    }
    // a formula written in LaTeX in the file is kept exactly as written, and drawn
    if (tex) {
      pushBlock({ t: 'math', text: cleanTex(plain(text)) });
      continue;
    }
    if (mathy) {
      const tidy = (row: string) => toMathText(plain(row)).replace(/[.;,]+$/, '');
      const rows = tg.para.rows?.map(tidy);
      const block: Block = { t: 'math', text: rows ? rows[0] : tidy(text) };
      // working shown over several rows keeps its rows; a formula with its name beside it keeps the name
      if (rows && rows.length > 1) block.steps = rows.slice(1);
      if (tg.para.caption) block.caption = tg.para.caption;
      pushBlock(block);
      continue;
    }
    pushBlock({ t: 'p', text });
    // "The graph of y = x² − 4 is a parabola." → the graph itself, right under the sentence
    const fns = graphFunctions(text);
    if (fns.length && !drawn.has(fns.join('|'))) {
      drawn.add(fns.join('|'));
      pushBlock({ t: 'graph', text: '', fns });
    }
  }

  // 4. no headings at all: cut long text into readable topics
  if (units.length === 1 && units[0].topics.length === 1 && units[0].topics[0].blocks.length > 18) {
    const only = units[0].topics[0];
    const chunks: Topic[] = [];
    const size = 12;
    for (let i = 0; i < only.blocks.length; i += size) {
      const blocks = only.blocks.slice(i, i + size);
      const firstText = blocks.find((b) => b.t === 'p');
      const name = firstText && firstText.t === 'p' ? firstText.text.split(/[.!?]/)[0].split(/\s+/).slice(0, 6).join(' ') : `Part ${chunks.length + 1}`;
      chunks.push({ id: `u1t${chunks.length + 1}`, title: name, blocks, exercises: [], concepts: [] });
    }
    chunks[chunks.length - 1].exercises = only.exercises.map((e) => ({ ...e, topicId: chunks[chunks.length - 1].id }));
    units[0].topics = chunks;
    warnings.push('No headings were found, so the notes were split into parts by length.');
  }

  // 5. tidy up and annotate
  for (const u of units) {
    // a few opening lines before the first section ("In this chapter…") are not a lesson of their own
    const lead = u.topics[0];
    if (lead && u.topics.length > 1 && /^(Overview|Introduction)$/.test(lead.title) && lead.exercises.length === 0 && lead.blocks.reduce((n, b) => n + ('text' in b ? b.text.length : b.t === 'list' ? b.items.join(' ').length : 400), 0) < 600) {
      u.topics[1].blocks.unshift(...lead.blocks);
      lead.blocks = [];
    }
    u.topics = u.topics.filter((tp) => tp.blocks.length > 0 || tp.exercises.length > 0);
    for (const tp of u.topics) {
      // the title says what a topic is about; its exercises confirm it; the body text is only a fallback
      const fromText = conceptsForText(tp.title);
      const tally = new Map<ConceptId, number>();
      for (const e of tp.exercises) e.concepts.forEach((c, i) => tally.set(c, (tally.get(c) ?? 0) + (i === 0 ? 2 : 1)));
      const fromExercises = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
      let ranked = [...fromText, ...fromExercises].filter((c) => CONCEPTS[c]);
      if (ranked.length === 0) {
        const body = tp.blocks.map((b) => ('text' in b ? b.text : b.t === 'list' ? b.items.join(' ') : b.t === 'table' ? b.rows.flat().join(' ') : b.lines.join(' '))).join(' ').slice(0, 1500);
        ranked = [...conceptsForText(`${u.title} ${body}`)];
      }
      tp.concepts = [...new Set(ranked)].slice(0, 4);
      if (tp.concepts.length === 0) tp.concepts = ['like-terms', 'inverse-operations'];
      for (const e of tp.exercises) if (e.concepts.length === 0) e.concepts = tp.concepts.slice(0, 1);
    }
  }
  const kept = units.filter((u) => u.topics.length > 0);
  if (kept.length === 0) {
    warnings.push('There wasn’t enough text here to build lessons from.');
  }
  // list items that are nothing but their number: the equations were pictures, not text
  const emptyItems = paras.filter((p) => /^\(?\d{1,2}[.)]$/.test(p.text.trim())).length;
  if (emptyItems >= 3) {
    warnings.push('The equations in this file are stored as pictures, so I couldn’t read them. A Word file, or a PDF exported straight from Word, will keep the maths.');
  }
  const exerciseCount = kept.reduce((n, u) => n + u.topics.reduce((k, tp) => k + tp.exercises.length, 0), 0);
  if (kept.length > 0 && exerciseCount === 0) {
    warnings.push('No exercises were found in these notes, so practice will use problems Lera writes for each topic.');
  }

  return {
    id: `${slug(title, 'notes')}-${now.getTime().toString(36)}`,
    title,
    fileName: raw.fileName,
    kind: raw.kind,
    addedAt: now.toISOString(),
    pages: raw.pages,
    units: kept,
    glossary: { ...harvestGlossary(paras), ...GLOSSARY },
    via: 'local',
    warnings,
  };
}
