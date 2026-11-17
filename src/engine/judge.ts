import { CONCEPTS } from './concepts';
import { AttemptAnalysis, CheckedLine, ConceptId, Diagnosis, Problem } from './types';

/**
 * The AI judges every line; the checker can veto.
 *
 * The AI reads each line the way a teacher does: what the student was trying to do, whether the rule was applied
 * properly, a risky shortcut, a poor habit. Its verdict is final wherever the checker cannot tell (a sentence of
 * reasoning, a form it cannot read as the problem). Where the checker has proved a line true, the AI may point out
 * a pattern worth knowing but cannot mark it wrong; where the checker has proved a line false, the AI explains the
 * mistake but cannot pass it. So no line is ever marked against a proof, in either direction.
 */

export interface AiLine {
  verdict: 'ok' | 'step' | 'error' | 'unsure';
  /** Short, names the rule. */
  title?: string;
  /** For an error: where and why. For a step: what is left. In the app's language. */
  note?: string;
  /** A poor habit or a risky shortcut seen on this line, even when the line is right. */
  pattern?: string;
  /** The line as it should read, or completed, in plain typed maths. */
  completesTo?: string;
  concept?: ConceptId;
  severity?: 'gap' | 'slip' | 'notation';
}

/** What the checker found about a line, in words the model can use. */
export function checkerSays(l: CheckedLine): string {
  if (l.aside && l.status === 'ok') return 'proved right (side working: a name or a differential)';
  switch (l.status) {
    case 'ok':
    case 'recovered':
      return 'proved right';
    case 'step':
      return 'a step: part of a rule done, the rest still to come';
    case 'wrong':
      return `proved wrong${l.diag && l.diag.code !== 'unknown' ? `: ${l.diag.title}` : ''}`;
    case 'carried':
      return 'follows from an earlier line that was wrong';
    case 'unreadable':
      return 'could not be read';
    default:
      return 'cannot be checked by the rules (judge it yourself)';
  }
}

const conceptOr = (c: ConceptId | undefined, problem: Problem): ConceptId => (c && c in CONCEPTS ? c : problem.concepts[0] ?? 'arithmetic');

/** The analysis with the AI's judgement folded in, under the checker's veto. */
export function withJudge(problem: Problem, a: AttemptAnalysis, ai: Record<string, AiLine>): AttemptAnalysis {
  if (!Object.keys(ai).length) return a;
  const lines = a.lines.map((l): CheckedLine => {
    const j = ai[l.text];
    if (!j) return l;
    const coach = j.pattern?.trim() || undefined;
    switch (l.status) {
      case 'ok':
      case 'recovered':
      case 'step':
        // proved right (or a fair step): never marked; a habit worth knowing is still said
        return coach ? { ...l, coach } : l;
      case 'wrong': {
        // proved wrong: never passed. When the rules could not name the mistake, the AI's reading names it
        if (!l.diag || l.diag.code !== 'unknown' || j.verdict !== 'error' || !j.note) return coach ? { ...l, coach } : l;
        const diag: Diagnosis = { ...l.diag, title: j.title || l.diag.title, message: j.note, concept: conceptOr(j.concept, problem), severity: j.severity === 'gap' ? 'gap' : 'slip' };
        return { ...l, diag, coach };
      }
      case 'carried':
      case 'unreadable':
        return l;
      default: {
        // the rules cannot tell: the AI decides
        if (j.verdict === 'ok') return { ...l, status: 'ok', judge: 'ai', note: undefined, coach };
        if (j.verdict === 'error' && j.note) {
          const diag: Diagnosis = {
            code: `ai:${j.concept ?? 'line'}`,
            concept: conceptOr(j.concept, problem),
            severity: j.severity ?? 'slip',
            title: j.title || j.note.split(/[.!?]/)[0],
            message: j.note,
            fix: j.completesTo || undefined,
          };
          return { ...l, status: 'wrong', judge: 'ai', diag, note: undefined, coach };
        }
        return coach ? { ...l, coach } : l;
      }
    }
  });
  const marks = lines.filter((l) => l.status === 'wrong' && l.diag).map((l) => l.diag as Diagnosis);
  return { ...a, lines, marks };
}
