import { hintLadder } from '../engine/analyze';
import { CONCEPTS, conceptsForText } from '../engine/concepts';
import { ConceptId, Problem } from '../engine/types';
import { GLOSSARY } from '../ingest/glossary';

/**
 * What Lera can say with no language model connected: definitions from the
 * notes' glossary, the concept library, and engine-made hints for the problem
 * in front of the student. Honest about where that stops.
 */
export interface LocalContext {
  glossary?: Record<string, string>;
  problem?: Problem;
  lines?: string[];
  topicTitle?: string;
}

function termsIn(text: string, glossary: Record<string, string>): string[] {
  const lower = text.toLowerCase();
  return Object.keys(glossary)
    .filter((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`).test(lower))
    .sort((a, b) => b.length - a.length)
    .filter((t, i, all) => !all.slice(0, i).some((longer) => longer.includes(t)))
    .slice(0, 3);
}

const STOP = new Set(['what', 'when', 'why', 'how', 'does', 'this', 'that', 'with', 'from', 'have', 'into', 'about', 'they', 'them', 'your', 'mean', 'explain', 'simply', 'tell', 'more', 'please', 'should', 'would', 'could', 'which', 'there', 'make']);
const stem = (w: string): string => w.replace(/(ing|ed|es|s|e)$/, '');

/** The concept whose title, summary and keywords share the most words with the question. */
function bestConcept(q: string): ConceptId | undefined {
  const words = [...new Set((q.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)).map(stem))].filter((w) => w.length >= 3);
  if (words.length === 0) return undefined;
  let best: ConceptId | undefined;
  let bestScore = 1;
  for (const c of Object.values(CONCEPTS)) {
    const title = c.title.toLowerCase();
    const body = `${c.short} ${c.keywords.join(' ')} ${c.trap?.note ?? ''}`.toLowerCase();
    let score = 0;
    for (const w of words) score += title.includes(w) ? 2 : body.includes(w) ? 1 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = c.id;
    }
  }
  return best;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function localAnswer(question: string, ctx: LocalContext): string {
  const q = question.trim();
  const glossary = { ...GLOSSARY, ...ctx.glossary };
  const parts: string[] = [];

  if (ctx.problem && /\b(hint|stuck|help|next|how do i|what now|start)\b/i.test(q)) {
    const ladder = hintLadder(ctx.problem, ctx.lines ?? []);
    if (ladder) return `${ladder.nudge}\n\n${ladder.method}`;
  }
  if (ctx.problem && /\b(answer|solution)\b/i.test(q)) {
    return 'I won’t hand over the answer, but tap **Hint** under your working and I’ll walk you there one rung at a time.';
  }

  for (const t of termsIn(q, glossary)) parts.push(`**${cap(t)}**, ${glossary[t]}`);

  const concept = bestConcept(q) ?? conceptsForText(q)[0] ?? (parts.length === 0 && ctx.topicTitle ? conceptsForText(ctx.topicTitle)[0] : undefined);
  if (concept) {
    const c = CONCEPTS[concept];
    // the idea first, then at most one definition
    parts.splice(0, parts.length, `**${c.title}.** ${c.explain[0]}`, ...(c.trap ? [`Watch for this: ${c.trap.note}`] : []), ...parts.slice(0, 1));
  }

  if (parts.length) return parts.join('\n\n');
  return 'I can’t answer that one on my own yet. Without an AI model connected I can define terms from your notes, explain any of the algebra ideas, and give hints on the problem you’re solving. Connect a free model in **Settings → AI assistant** and I’ll answer open questions too.';
}
