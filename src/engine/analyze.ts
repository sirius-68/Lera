import { Node, Statement, containsType, statementToLatex, walk } from './ast';
import { Prepared, exprChain, finalForm, prepare, relate } from './check';
import { diagnose, hasProductOfSums } from './diagnose';
import { parseLine } from './parse';
import { nextStep, solutionSteps } from './steps';
import { calcAnalyze, calcAnswer, calcHint, calcPath, isCalc } from './calc/check';
import { AttemptAnalysis, CheckedLine, ConceptId, Diagnosis, Problem, SolutionStep, StepTag } from './types';

/**
 * Read a student's working, line by line.
 *
 * Each line is compared with the line above it — not with the final answer —
 * so a right answer reached by a broken route still gets caught, and one
 * mistake is marked once instead of on every line after it.
 */
export function analyze(problem: Problem, rawLines: string[]): AttemptAnalysis {
  if (isCalc(problem.kind)) return calcAnalyze(problem, rawLines);
  const prep = prepare(problem);
  const texts = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (!prep) {
    return {
      lines: texts.map((text) => ({ text, status: 'unchecked' as const })),
      verdict: texts.length ? 'unfinished' : 'empty',
      marks: [],
      steps: texts.length,
      cleanSteps: 0,
    };
  }

  const clean = solutionSteps(prep);
  const lines: CheckedLine[] = [];
  let prev: Statement = prep.given;

  for (const text of texts) {
    const parsed = parseLine(text);
    if (!parsed.ok) {
      lines.push({ text, status: 'unreadable', note: parsed.error });
      continue;
    }
    const st = parsed.st;
    const latex = statementToLatex(st);

    if (prep.mode === 'expr') {
      const chain = exprChain(st);
      if (!chain) {
        lines.push({ text, status: 'unchecked', st, latex, note: 'This problem is an expression, so there’s no need for an inequality here.' });
        continue;
      }
      // "a = b = c" on one line is several steps; find the first link that breaks
      let cursor = prev;
      let broken: { from: Statement; to: Statement } | null = null;
      let undecided = false;
      for (const e of chain) {
        const cur: Statement = { kind: 'expr', expr: e };
        const follows = relate(prep, cursor, cur);
        if (follows === null) undecided = true;
        if (follows === false && !broken) broken = { from: cursor, to: cur };
        cursor = cur;
      }
      const last = cursor;
      const trueToGiven = relate(prep, prep.given, last) === true;
      if (undecided && !broken) {
        lines.push({ text, status: 'unchecked', st, latex });
        prev = last;
        continue;
      }
      lines.push(buildLine(prep, text, st, latex, broken, trueToGiven, last));
      prev = last;
      continue;
    }

    if (st.kind === 'expr') {
      lines.push({
        text,
        status: 'unchecked',
        st,
        latex,
        note: 'Write the whole line with its = sign so I can follow it.',
      });
      continue;
    }

    const follows = relate(prep, prev, st);
    const trueToGiven = relate(prep, prep.given, st);
    if (follows === null || trueToGiven === null) {
      lines.push({ text, status: 'unchecked', st, latex });
      prev = st;
      continue;
    }
    lines.push(buildLine(prep, text, st, latex, follows ? null : { from: prev, to: st }, trueToGiven, st));
    prev = st;
  }

  const checked = lines.filter((l) => l.status !== 'unreadable' && l.status !== 'unchecked');
  const last = checked[checked.length - 1];
  let verdict: AttemptAnalysis['verdict'] = 'empty';
  let remaining: string | undefined;
  if (last) {
    if (last.trueToGiven) {
      if (last.isFinal) verdict = 'solved';
      else {
        verdict = 'unfinished';
        remaining = last.st ? finalForm(prep, last.st).remaining : undefined;
      }
    } else verdict = 'wrong';
  } else if (lines.length) verdict = 'unfinished';

  const marks: Diagnosis[] = lines.filter((l) => l.status === 'wrong' && l.diag).map((l) => l.diag as Diagnosis);
  const steps = checked.length;
  const cleanSteps = clean.length;

  if (verdict === 'solved' && cleanSteps > 0 && steps >= cleanSteps + 3 && steps >= cleanSteps * 2) {
    marks.push({
      code: 'long-way',
      concept: problem.concepts[0] ?? 'simplest-form',
      severity: 'strategy',
      title: 'Right answer, long road.',
      message: `You got there in ${steps} lines; it can be done in ${cleanSteps}. Nothing was wrong — there’s just a shorter route worth seeing.`,
    });
  }

  return { lines, verdict, marks, approach: detectApproach(prep, lines), steps, cleanSteps, remaining };
}

function buildLine(
  prep: Prepared,
  text: string,
  st: Statement,
  latex: string,
  broken: { from: Statement; to: Statement } | null,
  trueToGiven: boolean,
  lastSt: Statement,
): CheckedLine {
  if (!broken) {
    const isFinal = trueToGiven ? finalForm(prep, lastSt).final : false;
    return { text, st, latex, status: trueToGiven ? 'ok' : 'carried', trueToGiven, isFinal };
  }
  if (trueToGiven) {
    // doesn't follow from the (already wrong) line above, but is right again
    return { text, st, latex, status: 'recovered', trueToGiven, isFinal: finalForm(prep, lastSt).final };
  }
  let diag: Diagnosis;
  try {
    diag = diagnose(prep, broken.from, broken.to);
  } catch {
    diag = {
      code: 'unknown',
      concept: prep.problem.concepts[0] ?? 'arithmetic',
      severity: 'gap',
      title: 'This line doesn’t follow from the one above.',
      message: 'Something changed between these two lines that shouldn’t have.',
    };
  }
  if (!diag.fix) {
    const hint = nextStep(prep, broken.from);
    if (hint) diag = { ...diag, fix: hint.line };
  }
  return { text, st, latex, status: 'wrong', trueToGiven: false, isFinal: false, diag };
}

function anyNode(st: Statement | undefined, test: (n: Node) => boolean): boolean {
  if (!st) return false;
  const roots: Node[] = st.kind === 'expr' ? [st.expr] : st.kind === 'rel' ? st.rels.flatMap((r) => [r.lhs, r.rhs]) : [];
  let hit = false;
  for (const r of roots) walk(r, (x) => {
    if (test(x)) hit = true;
  });
  return hit;
}

function detectApproach(prep: Prepared, lines: CheckedLine[]): string | undefined {
  const sts = lines.map((l) => l.st).filter(Boolean) as Statement[];
  if (sts.length === 0) return undefined;
  const kind = prep.problem.kind;
  if (kind === 'quadratic' || (prep.mode === 'eq' && prep.solution && prep.solution.roots.length >= 2)) {
    const completing = sts.some(
      (s) => s.kind === 'rel' && s.rels.length === 1 && s.rels[0].lhs.t === 'pow' && s.rels[0].lhs.base.t === 'add' && !containsType(s.rels[0].rhs, 'var'),
    );
    if (completing && !anyNode(prep.given, (n) => n.t === 'pow' && n.base.t === 'add')) return 'completing the square';
    if (lines.some((l) => /±|sqrt|√/.test(l.text)) && sts.some((s) => anyNode(s, (n) => n.t === 'div' && containsType(n.num, 'sqrt'))))
      return 'quadratic formula';
    if (sts.some((s) => s.kind === 'rel' && s.rels.some((r) => hasProductOfSums(r.lhs) || hasProductOfSums(r.rhs)))) return 'factoring';
    if (lines.some((l) => /±|sqrt|√/.test(l.text))) return 'square roots';
    return undefined;
  }
  if (kind === 'linear' || kind === 'inequality') {
    const givenHasBrackets = anyNode(prep.given, (n) => (n.t === 'mul' && n.args.some((a) => a.t === 'add')) || (n.t === 'neg' && n.arg.t === 'add'));
    const givenHasFractions = anyNode(prep.given, (n) => n.t === 'div');
    const first = sts[0];
    if (givenHasFractions && !anyNode(first, (n) => n.t === 'div')) return 'clear fractions first';
    if (givenHasBrackets) {
      const stillBrackets = anyNode(first, (n) => (n.t === 'mul' && n.args.some((a) => a.t === 'add')) || (n.t === 'neg' && n.arg.t === 'add'));
      return stillBrackets ? 'divide first' : 'expand first';
    }
    return sts.length <= 2 ? 'isolate directly' : 'one move per line';
  }
  if (kind === 'system') {
    return lines.some((l) => /=/.test(l.text) && l.st?.kind === 'rel' && l.st.rels.length === 1 && l.st.rels[0].lhs.t === 'var') ? 'substitution' : 'elimination';
  }
  return undefined;
}

/* ───────────── hints ───────────── */

const NUDGE: Record<StepTag, string> = {
  'clear-fractions': 'The fractions are making this harder than it needs to be. What could you multiply everything by to get rid of them?',
  expand: 'There are brackets in the way. What does the number outside do to each term inside?',
  collect: 'Some terms on the same side are the same kind. What happens if you combine them?',
  move: 'You want the unknown on one side and plain numbers on the other. Which term could you move — and what happens to its sign?',
  divide: 'The unknown is being multiplied by a number. What undoes multiplying?',
  'standard-form': 'Quadratics are easiest when one side is zero. What would you move across?',
  factor: 'Can you write this as two brackets multiplied together?',
  'common-factor': 'Look at what every term has in common. Can you take it outside a bracket?',
  'zero-product': 'If two things multiply to make zero, what must be true about one of them?',
  sqrt: 'What undoes squaring — and how many answers does it give?',
  formula: 'This one won’t split into neat brackets. Which formula works for every quadratic?',
  substitute: 'Start by swapping each letter for its value. Use brackets around negatives.',
  evaluate: 'Which operation has to happen first here?',
  cancel: 'Is there a factor that appears on both the top and the bottom?',
  system: 'Could you add or subtract the two equations so that one letter disappears?',
  calc: 'Which rule fits the shape of this one?',
  final: 'You’re nearly there. What does the last line need to look like?',
};

export interface HintLadder {
  /** Rung 1: a question that points at the idea. */
  nudge: string;
  /** Rung 2: the method, named. */
  method: string;
  /** Rung 3: the next line itself. */
  line: string;
  tag: StepTag;
  /** Concept this step exercises (for the learner model). */
  concept?: ConceptId;
}

const TAG_CONCEPT: Partial<Record<StepTag, ConceptId>> = {
  'clear-fractions': 'clearing-fractions',
  expand: 'distributive',
  collect: 'like-terms',
  move: 'inverse-operations',
  divide: 'balance',
  factor: 'factoring',
  'common-factor': 'factoring',
  'zero-product': 'zero-product',
  sqrt: 'square-root-pm',
  formula: 'quadratic-formula',
  evaluate: 'order-of-operations',
  cancel: 'fractions',
  system: 'systems',
};

/** Three rungs of help for wherever the student currently is. */
export function hintLadder(problem: Problem, rawLines: string[]): HintLadder | null {
  if (isCalc(problem.kind)) {
    const h = calcHint(problem, rawLines);
    return h ? { nudge: h.nudge, method: h.method, line: h.line, tag: 'calc', concept: h.concept } : null;
  }
  const prep = prepare(problem);
  if (!prep) return null;
  const a = analyze(problem, rawLines);
  // stand on the last line that is still true to the problem
  let from: Statement = prep.given;
  for (const l of a.lines) {
    if (l.trueToGiven && l.st) {
      const chain = prep.mode === 'expr' ? exprChain(l.st) : null;
      from = chain ? { kind: 'expr', expr: chain[chain.length - 1] } : l.st;
    }
  }
  const step: SolutionStep | null = nextStep(prep, from);
  if (!step) return null;
  return { nudge: NUDGE[step.tag], method: step.why, line: step.line, tag: step.tag, concept: TAG_CONCEPT[step.tag] };
}

/** The clean path for a problem, for the "your route vs a clean route" comparison. */
export function cleanPath(problem: Problem): SolutionStep[] {
  if (isCalc(problem.kind)) return calcPath(problem);
  const prep = prepare(problem);
  return prep ? solutionSteps(prep) : [];
}

/** Final answer as text, when the engine can work it out. */
export function answerOf(problem: Problem): string | null {
  if (isCalc(problem.kind)) return calcAnswer(problem);
  const path = cleanPath(problem);
  return path.length ? path[path.length - 1].line : null;
}
