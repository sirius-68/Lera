import { CONCEPTS } from '../engine/concepts';
import { PREREQS, SUBJECT_LABEL, subjectOf } from '../engine/concepts-calc';
import { ConceptId } from '../engine/types';
import { LeraDoc, Topic } from '../ingest/types';
import { daysBetween, dayOf, statusOf } from './learner';
import { AppState, AttemptRecord, ConceptState } from './types';

/**
 * Everything Lera can say about where a learner is weak — and what to do
 * about each one. Each finding is tied to an idea and, when the learner's own
 * notes teach that idea, to the lesson to go back to.
 *
 * Nothing here is a guess about the person; every finding is counted from
 * lines they actually wrote.
 */

export type WeaknessKind =
  | 'gap' //        a rule that isn't there yet
  | 'root' //       a gap that probably starts in an earlier idea
  | 'pattern' //    the same slip on several days
  | 'family' //     one kind of error across many ideas (signs, brackets …)
  | 'hints' //      only solved when shown the line
  | 'unfinished' // stops before the final answer
  | 'rushing' //    slips come with speed
  | 'early' //      errors land on the first line
  | 'late' //       errors land on the last line
  | 'lesson' //     one lesson from the notes keeps going wrong
  | 'rusty' //      solid once, not seen for a long time
  | 'confused'; //  said the explanation didn't make sense

export interface Weakness {
  id: string;
  kind: WeaknessKind;
  tone: 'gap' | 'slip' | 'info';
  title: string;
  /** One or two plain sentences. `**…**` is bold, `$…$` is maths. */
  detail: string;
  concept?: ConceptId;
  /** The lesson in the learner's notes that teaches this. */
  topic?: { id: string; title: string };
  /** Bigger = more worth doing first. */
  score: number;
  action: { label: string; type: 'review' | 'lesson' | 'practice'; concept?: ConceptId; topicId?: string };
}

type State = Pick<AppState, 'attempts' | 'concepts' | 'docs'> & { understood?: AppState['understood'] };

const times = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** The lesson in the learner's notes that leans most on a concept. */
export function topicFor(docs: LeraDoc[], concept: ConceptId, attempts: AttemptRecord[] = []): { id: string; title: string } | undefined {
  let best: { topic: Topic; score: number } | null = null;
  for (const doc of docs) {
    for (const unit of doc.units) {
      for (const topic of unit.topics) {
        const at = topic.concepts.indexOf(concept);
        const inExercises = topic.exercises.filter((e) => e.concepts.includes(concept)).length;
        if (at < 0 && inExercises === 0) continue;
        const marked = attempts.filter((a) => a.topicId === topic.id && a.marks.some((m) => m.concept === concept)).length;
        const score = (at === 0 ? 3 : at > 0 ? 2 : 0) + Math.min(3, inExercises) + marked * 2 + (topic.blocks.length > 0 ? 1 : 0);
        if (!best || score > best.score) best = { topic, score };
      }
    }
  }
  return best ? { id: best.topic.id, title: best.topic.title } : undefined;
}

type Family = 'sign' | 'brackets' | 'fractions' | 'powers' | 'inside' | 'numbers';

const FAMILY_TEXT: Record<Family, { title: string; detail: string; concept: ConceptId }> = {
  sign: { title: 'Minus signs keep slipping', detail: 'Across different topics, the same thing goes wrong: a sign flips or gets lost. Before you move on from a line, point at every minus and ask “did this one survive?”', concept: 'signed-arithmetic' },
  brackets: { title: 'Brackets are costing you marks', detail: 'When something multiplies a bracket, part of the bracket gets left out. Draw an arrow from the outside term to **each** term inside before you write the next line.', concept: 'distributive' },
  fractions: { title: 'Fractions trip you in several topics', detail: 'The method is usually right until a fraction appears. Clear fractions first — multiply everything by a common bottom — then carry on with whole numbers.', concept: 'fractions' },
  powers: { title: 'Powers go wrong in more than one place', detail: 'Whether it is multiplying powers or differentiating them, the little number on top is being mishandled. Say out loud what happens to the power before you write it.', concept: 'exponent-rules' },
  inside: { title: 'The “inside” keeps getting forgotten', detail: 'When one function sits inside another, you deal with the outside and stop. Both differentiating and integrating need a second step for the inside.', concept: 'chain-rule' },
  numbers: { title: 'The method is right — the sums aren’t', detail: 'Your marks are mostly miscounted numbers, not wrong rules. Write the small sums at the side instead of doing them in your head.', concept: 'arithmetic' },
};

function familyOf(code: string, concept: ConceptId): Family | null {
  if (/sign|neg|minus|flip/.test(code) || concept === 'signed-arithmetic') return 'sign';
  if (/chain|inner/.test(code) || concept === 'chain-rule' || concept === 'u-substitution') return 'inside';
  if (/distrib|bracket|expand|half|foil/.test(code) || concept === 'distributive' || concept === 'expanding-binomials') return 'brackets';
  if (concept === 'fractions' || concept === 'clearing-fractions' || /fraction|denom/.test(code)) return 'fractions';
  if (/power|expon/.test(code) || concept === 'exponent-rules' || concept === 'power-rule') return 'powers';
  if (/arith|coefficient/.test(code) || concept === 'arithmetic') return 'numbers';
  return null;
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function weaknesses(state: State, today: string = dayOf()): Weakness[] {
  const out: Weakness[] = [];
  const { attempts, concepts, docs } = state;
  const all = Object.values(concepts).filter((c): c is ConceptState => !!c);
  const lessonAction = (concept: ConceptId): Weakness['action'] & { topic?: { id: string; title: string } } => {
    const topic = topicFor(docs, concept, attempts);
    return topic ? { label: `Re-read: ${topic.title}`, type: 'lesson', topicId: topic.id, concept, topic } : { label: `Review · ${CONCEPTS[concept].minutes} min`, type: 'review', concept };
  };
  const add = (w: Omit<Weakness, 'topic' | 'action'> & { action?: Weakness['action'] }): void => {
    const la = w.concept ? lessonAction(w.concept) : undefined;
    const action = w.action ?? (la ? { label: la.label, type: la.type, topicId: la.topicId, concept: la.concept } : { label: 'Practise', type: 'practice' as const });
    out.push({ ...w, topic: la?.topic, action });
  };

  // 1. gaps that are still open
  for (const c of all.filter((x) => x.outstanding && x.gaps > 0)) {
    const need = Math.max(0, 2 - c.cleanDays.length);
    add({
      id: `gap:${c.id}`,
      kind: 'gap',
      tone: 'gap',
      title: CONCEPTS[c.id].title,
      detail: `Marked as a gap ${times(c.gaps)}${c.lastTitle ? ` — “${c.lastTitle.replace(/\*\*/g, '')}”` : ''}. It clears after ${need === 2 ? 'two clean solves on different days' : need === 1 ? 'one more clean solve on another day' : 'today’s clean solve settles'}.`,
      concept: c.id,
      score: 100 + c.gaps * 8 - c.cleanDays.length * 15,
    });
  }

  // 2. root causes: a gap whose prerequisite is also weak
  for (const c of all.filter((x) => x.outstanding)) {
    for (const pre of PREREQS[c.id] ?? []) {
      const p = concepts[pre];
      const st = statusOf(p);
      const weak = st === 'gap' || (st === 'shaky' && !!p && p.slips + p.gaps >= 2);
      if (!weak) continue;
      add({
        id: `root:${c.id}:${pre}`,
        kind: 'root',
        tone: 'gap',
        title: `Start with: ${CONCEPTS[pre].title}`,
        detail: `**${CONCEPTS[c.id].title}** is built on **${CONCEPTS[pre].title}**, and that one is shaky too. Fix the earlier idea first — the later one often fixes itself.`,
        concept: pre,
        score: 120 + (p?.gaps ?? 0) * 5,
      });
      break;
    }
  }

  // 3. the same slip on several days
  for (const c of all.filter((x) => x.rushing && !(x.outstanding && x.gaps > 0))) {
    add({
      id: `pattern:${c.id}`,
      kind: 'pattern',
      tone: 'slip',
      title: `A habit, not a one-off: ${CONCEPTS[c.id].title}`,
      detail: `You know this rule — and you have still slipped on it ${times(c.slips)}${c.slipDays.length > 1 ? ` across ${c.slipDays.length} days` : ''}. That is a pattern worth two minutes.`,
      concept: c.id,
      score: 70 + c.slips * 4,
    });
  }

  // 4. one family of error across many ideas
  const fam = new Map<Family, { n: number; concepts: Set<ConceptId>; days: Set<string> }>();
  for (const a of attempts) {
    for (const m of a.marks) {
      if (m.severity !== 'gap' && m.severity !== 'slip') continue;
      const f = familyOf(m.code, m.concept);
      if (!f) continue;
      const e = fam.get(f) ?? { n: 0, concepts: new Set<ConceptId>(), days: new Set<string>() };
      e.n++;
      e.concepts.add(m.concept);
      e.days.add(a.day);
      fam.set(f, e);
    }
  }
  for (const [f, e] of fam) {
    if (e.n < 3 || (e.concepts.size < 2 && e.days.size < 2)) continue;
    const t = FAMILY_TEXT[f];
    add({ id: `family:${f}`, kind: 'family', tone: 'slip', title: t.title, detail: `${t.detail} (${e.n} marks in ${e.concepts.size} ${e.concepts.size === 1 ? 'idea' : 'different ideas'}.)`, concept: t.concept, score: 80 + e.n * 3 + e.concepts.size * 4 });
  }

  // 5. only solved with the line shown
  const byConcept = new Map<ConceptId, AttemptRecord[]>();
  for (const a of attempts) for (const id of a.concepts) byConcept.set(id, [...(byConcept.get(id) ?? []), a]);
  for (const [id, list] of byConcept) {
    const recent = list.slice(-6);
    const shown = recent.filter((a) => a.hintRung >= 3).length;
    if (recent.length >= 3 && shown / recent.length >= 0.5 && !out.some((w) => w.concept === id && w.kind === 'gap')) {
      add({
        id: `hints:${id}`,
        kind: 'hints',
        tone: 'gap',
        title: `Leaning on hints: ${CONCEPTS[id].title}`,
        detail: `In ${shown} of your last ${recent.length} problems here you needed to be shown the line. Being shown feels like knowing — it isn’t yet. Read the review, then try one with no hints.`,
        concept: id,
        score: 75 + shown * 5,
      });
    }
  }

  // 6. stops before the answer
  const recent = attempts.slice(-30);
  const unfinished = recent.filter((a) => a.verdict === 'unfinished' && a.lines.length > 0 && a.lines.every((l) => l.status !== 'wrong'));
  if (recent.length >= 6 && unfinished.length >= 3) {
    const kinds = new Map<string, number>();
    unfinished.forEach((a) => kinds.set(a.kind, (kinds.get(a.kind) ?? 0) + 1));
    const [topKind] = [...kinds.entries()].sort((x, y) => y[1] - x[1])[0];
    const integral = topKind === 'integral';
    add({
      id: 'unfinished',
      kind: 'unfinished',
      tone: 'slip',
      title: integral ? 'The + C keeps going missing' : 'You stop one line early',
      detail: integral ? `${unfinished.length} of your recent integrals were right but unfinished — the **+ C** was missing. Make it the last thing your hand does.` : `${unfinished.length} of your last ${recent.length} problems were correct as far as they went, but not finished. Before you stop, ask: can anything still be combined, cancelled or worked out?`,
      concept: integral ? 'constant-of-integration' : 'simplest-form',
      score: 60 + unfinished.length * 3,
    });
  }

  // 7. speed and slips
  const slipped = recent.filter((a) => a.marks.some((m) => m.severity === 'slip') && a.seconds > 0).map((a) => a.seconds / Math.max(1, a.steps));
  const cleanOnes = recent.filter((a) => a.verdict === 'solved' && a.marks.length === 0 && a.seconds > 0).map((a) => a.seconds / Math.max(1, a.steps));
  if (slipped.length >= 3 && cleanOnes.length >= 3 && median(slipped) < median(cleanOnes) * 0.7) {
    add({
      id: 'rushing',
      kind: 'rushing',
      tone: 'slip',
      title: 'Your slips happen when you speed up',
      detail: `On problems where you slipped you spent about **${Math.round(median(slipped))} seconds a line**; on your clean ones, **${Math.round(median(cleanOnes))}**. The few extra seconds are the difference.`,
      score: 58,
      action: { label: 'Slow practice', type: 'practice' },
    });
  }

  // 8. where on the page the mistakes land
  const positions = attempts.flatMap((a) => a.marks.filter((m) => m.severity === 'gap' || m.severity === 'slip').map((m) => ({ first: m.line === 0, last: m.line >= a.lines.length - 1 && a.lines.length > 1 })));
  if (positions.length >= 5) {
    const first = positions.filter((p) => p.first).length / positions.length;
    const last = positions.filter((p) => p.last).length / positions.length;
    if (first >= 0.6) add({ id: 'early', kind: 'early', tone: 'info', title: 'Most mistakes are on your first line', detail: 'The first move is where it goes wrong — usually the set-up, not the working. Before writing anything, say what kind of problem it is and which rule it needs.', score: 50, action: { label: 'Practise set-ups', type: 'practice' } });
    else if (last >= 0.6) add({ id: 'late', kind: 'late', tone: 'info', title: 'Most mistakes are on your last line', detail: 'You do the hard part, then slip at the finish. Re-read the final line against the one above it before you move on.', score: 50, concept: 'simplest-form' });
  }

  // 9. one lesson from the notes that keeps going wrong
  const byTopic = new Map<string, AttemptRecord[]>();
  for (const a of attempts) if (a.topicId) byTopic.set(a.topicId, [...(byTopic.get(a.topicId) ?? []), a]);
  for (const [topicId, list] of byTopic) {
    const last = list.slice(-6);
    const bad = last.filter((a) => a.marks.some((m) => m.severity === 'gap') || a.verdict === 'wrong' || a.hintRung >= 3).length;
    if (last.length < 3 || bad / last.length < 0.6) continue;
    let title = '';
    for (const d of docs) for (const u of d.units) for (const t of u.topics) if (t.id === topicId) title = t.title;
    if (!title) continue;
    add({
      id: `lesson:${topicId}`,
      kind: 'lesson',
      tone: 'gap',
      title: `Go back to the lesson: ${title}`,
      detail: `${bad} of your last ${last.length} problems from this lesson had a real gap, a wrong finish or a revealed answer. More practice won’t fix that — **reading the lesson again will**.`,
      score: 95 + bad * 3,
      action: { label: `Re-read: ${title}`, type: 'lesson', topicId },
    });
  }

  // 10. ideas that were solid and have not been seen for a long time
  for (const c of all) {
    if (statusOf(c) !== 'solid' || !c.lastSeen) continue;
    const idle = daysBetween(c.lastSeen, today);
    if (idle < 30) continue;
    add({ id: `rusty:${c.id}`, kind: 'rusty', tone: 'info', title: `Getting rusty: ${CONCEPTS[c.id].title}`, detail: `You had this — ${idle} days ago. One quick problem now is cheaper than relearning it later.`, concept: c.id, score: 30 + Math.min(20, idle / 5), action: { label: 'One quick problem', type: 'practice', concept: c.id } });
  }

  // 11. explanations that didn't land
  for (const [id, v] of Object.entries(state.understood ?? {})) {
    if (v !== 'no' || !(id in CONCEPTS)) continue;
    const cid = id as ConceptId;
    if (out.some((w) => w.concept === cid)) continue;
    add({ id: `confused:${cid}`, kind: 'confused', tone: 'info', title: `Still unclear: ${CONCEPTS[cid].title}`, detail: 'You said the explanation didn’t make sense. That’s useful to know — here it is again in plainer words, with an example to walk through.', concept: cid, score: 65, action: { label: 'Explain it again', type: 'review', concept: cid } });
  }

  // one finding per concept+kind, strongest first
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.score - a.score)
    .filter((w) => {
      if (seen.has(w.id)) return false;
      seen.add(w.id);
      return true;
    });
}

/** The single most useful thing to do next, for the home screen. */
export function topWeakness(state: State, today: string = dayOf()): Weakness | null {
  return weaknesses(state, today)[0] ?? null;
}

/** Subjects ranked by how much trouble they are giving — for the progress screen. */
export function troubleBySubject(state: Pick<AppState, 'attempts'>): { subject: string; marks: number; problems: number }[] {
  const map = new Map<string, { marks: number; problems: number }>();
  for (const a of state.attempts) {
    const subject = SUBJECT_LABEL[subjectOf(a.concepts[0] ?? 'arithmetic')];
    const e = map.get(subject) ?? { marks: 0, problems: 0 };
    e.problems++;
    e.marks += a.marks.filter((m) => m.severity === 'gap' || m.severity === 'slip').length;
    map.set(subject, e);
  }
  return [...map.entries()].map(([subject, v]) => ({ subject, ...v })).sort((a, b) => b.marks - a.marks);
}
