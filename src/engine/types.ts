import { Statement } from './ast';

export type ConceptId =
  | 'inverse-operations'
  | 'balance'
  | 'distributive'
  | 'like-terms'
  | 'signed-arithmetic'
  | 'arithmetic'
  | 'exponent-rules'
  | 'expanding-binomials'
  | 'factoring'
  | 'zero-product'
  | 'square-root-pm'
  | 'dividing-by-variable'
  | 'inequality-flip'
  | 'fractions'
  | 'clearing-fractions'
  | 'order-of-operations'
  | 'quadratic-formula'
  | 'systems'
  | 'simplest-form'
  // calculus 1
  | 'limits'
  | 'power-rule'
  | 'product-rule'
  | 'quotient-rule'
  | 'chain-rule'
  | 'trig-derivatives'
  | 'exp-log-derivatives'
  // calculus 2
  | 'antiderivatives'
  | 'constant-of-integration'
  | 'u-substitution'
  | 'integration-by-parts'
  | 'definite-integrals';

export type Subject = 'algebra' | 'calc1' | 'calc2';

export type ProblemKind =
  | 'linear'
  | 'quadratic'
  | 'equation'
  | 'inequality'
  | 'simplify'
  | 'expand'
  | 'factor'
  | 'evaluate'
  | 'system'
  | 'derivative'
  | 'integral'
  | 'definite'
  | 'limit'
  | 'open';

export interface Problem {
  id: string;
  kind: ProblemKind;
  /** The instruction as words: "Solve for x". */
  prompt: string;
  /** The maths itself in linear text: "3x + 4 = 19". Empty for open problems. */
  given: string;
  variable?: string;
  /** For "evaluate when x = 4" problems. */
  subs?: Record<string, string>;
  concepts: ConceptId[];
  source: 'notes' | 'generated' | 'review';
  topicId?: string;
  level?: 1 | 2 | 3;
  /** Written by Lera's AI for this lesson, on request (not found in the file). */
  made?: 'lera';
  /** Original wording from the student's notes, when it came from there. */
  original?: string;
}

/**
 * How serious a mark is — and therefore what Lera does about it.
 *  gap        doesn't know the rule            → review + back in the queue
 *  slip       knows it, mis-executed           → nudge only
 *  notation   sloppy, not wrong                → named, no review
 *  strategy   valid but costly                 → shown after the answer lands
 *  incomplete stopped short                    → prompted before submit
 */
export type Severity = 'gap' | 'slip' | 'notation' | 'strategy' | 'incomplete';

export interface Diagnosis {
  code: string;
  concept: ConceptId;
  severity: Severity;
  /** Short and punchy: "Signs flip when a term crosses the equals sign." */
  title: string;
  /** One or two sentences. `$…$` wraps maths in linear text. */
  message: string;
  /** A correct version of this line, linear text. */
  fix?: string;
}

export type LineStatus =
  | 'ok' //          follows from the line above, and still true to the problem
  | 'wrong' //       does not follow from the line above
  | 'carried' //     follows from the line above, but that line was already off
  | 'recovered' //   doesn't follow from the (wrong) line above, yet is correct again
  | 'unreadable' //  couldn't be parsed
  | 'unchecked'; //  parsed, but not something that can be compared

export interface CheckedLine {
  text: string;
  status: LineStatus;
  st?: Statement;
  latex?: string;
  diag?: Diagnosis;
  note?: string;
  /** True when this line is a finished, acceptable answer. */
  isFinal?: boolean;
  /** Says the same thing as the original problem. */
  trueToGiven?: boolean;
}

export type Verdict = 'solved' | 'unfinished' | 'wrong' | 'empty';

export interface AttemptAnalysis {
  lines: CheckedLine[];
  verdict: Verdict;
  /** Marks worth recording against the learner model. */
  marks: Diagnosis[];
  /** Named approach, e.g. "factoring", "quadratic formula", "expand first". */
  approach?: string;
  steps: number;
  cleanSteps: number;
  /** What's missing when the verdict is 'unfinished'. */
  remaining?: string;
}

export type StepTag =
  | 'clear-fractions' | 'expand' | 'collect' | 'move' | 'divide' | 'standard-form' | 'factor' | 'common-factor'
  | 'zero-product' | 'sqrt' | 'formula' | 'substitute' | 'evaluate' | 'cancel' | 'system' | 'calc' | 'final';

export interface SolutionStep {
  line: string;
  why: string;
  tag: StepTag;
}
