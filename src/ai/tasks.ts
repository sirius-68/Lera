import { CONCEPTS } from '../engine/concepts';
import { ConceptId, Diagnosis, Problem } from '../engine/types';
import { buildProblem, plain, structureDoc } from '../ingest/structure';
import { Block, LeraDoc, RawDoc, RawPara, Topic, Unit } from '../ingest/types';
import { ChatMessage, chat, extractJson } from './client';
import { AiConfig } from './providers';

const VOICE = `You are Lera, a calm, precise maths tutor for school and first-year university students (algebra, calculus 1 and calculus 2).
Write the way a good teacher talks: short sentences, plain everyday words, no praise padding, no exclamation marks. Assume the student is meeting the idea for the first time.
You work alongside a rule-based checker. The checker decides what is right and wrong; you only put things into words. Stay inside the topic you are given — if asked about something else, say it is outside this lesson.
Never just hand over a final answer to a problem the student is working on — point at the idea instead.
Write maths in plain linear text between dollar signs, like $3x + 4 = 19$ or $x^2 - 9$. Do not use LaTeX commands.`;

/* ───────────── reading notes ───────────── */

interface AiTopic {
  title?: string;
  blocks?: { t?: string; text?: string; items?: string[]; lines?: string[]; title?: string; label?: string }[];
  exercises?: { instruction?: string; math?: string; text?: string }[];
}
interface AiDoc {
  title?: string;
  units?: { title?: string; topics?: AiTopic[] }[];
  glossary?: Record<string, string>;
}

const STRUCTURE_PROMPT = `You turn a student's raw notes into structured lessons.
The notes were extracted from a PDF or Word file, so maths may be garbled: fix obvious extraction damage (missing powers, broken fractions) but never invent content that is not there.

Return ONLY a JSON object:
{
  "title": string,
  "units": [{ "title": string, "topics": [{
      "title": string,
      "blocks": [
        {"t":"p","text":string} | {"t":"h","text":string} | {"t":"math","text":string} |
        {"t":"list","items":[string]} | {"t":"example","title":string,"lines":[string]} |
        {"t":"note","label":string,"text":string}
      ],
      "exercises": [{"instruction": string, "math": string}]
  }]}],
  "glossary": { "term": "one-sentence definition" }
}

Rules:
- Keep the author's wording for explanations. Do not summarise away content.
- Write all maths as plain linear text: 3x + 4 = 19, x^2 - 5x + 6, (x + 1)/(x - 2), sqrt(9), <=, >=. Inside prose, wrap maths in $...$.
- "math" blocks are display equations on their own line.
- Worked examples (question plus worked steps) go in "example" blocks, one step per line.
- Anything the student is meant to do themselves goes in "exercises", NOT in blocks. "instruction" is the task in words (Solve for x, Simplify, Factorise, Expand, Evaluate when x = 2); "math" is only the expression or equation.
- Word problems with no single expression: put the full text in "instruction" and leave "math" empty.
- 2 to 6 units, each with 1 to 8 topics, following the notes' own headings where they exist.`;

function chunkParas(paras: RawPara[], limit = 9000): RawPara[][] {
  const chunks: RawPara[][] = [];
  let cur: RawPara[] = [];
  let size = 0;
  for (const p of paras) {
    const isTop = p.level !== undefined && p.level <= 1;
    if (cur.length && (size + p.text.length > limit || (isTop && size > limit * 0.5))) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(p);
    size += p.text.length + 8;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

function renderParas(paras: RawPara[]): string {
  return paras
    .map((p) => {
      const tag = p.level === 0 ? '[TITLE] ' : p.level ? `[H${p.level}] ` : p.list ? '- ' : '';
      return tag + p.text;
    })
    .join('\n');
}

function toBlocks(raw: AiTopic['blocks']): Block[] {
  const out: Block[] = [];
  for (const b of raw ?? []) {
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    switch (b.t) {
      case 'p':
        if (text) out.push({ t: 'p', text });
        break;
      case 'h':
        if (text) out.push({ t: 'h', text });
        break;
      case 'math':
        if (text) out.push({ t: 'math', text: plain(text) });
        break;
      case 'list':
        if (Array.isArray(b.items) && b.items.length) out.push({ t: 'list', ordered: false, items: b.items.map(String) });
        break;
      case 'example':
        if (Array.isArray(b.lines) && b.lines.length) out.push({ t: 'example', title: b.title?.trim() || 'Example', lines: b.lines.map(String) });
        break;
      case 'note':
        if (text) out.push({ t: 'note', label: b.label?.trim() || 'Note', text });
        break;
      default:
        if (text) out.push({ t: 'p', text });
    }
  }
  return out;
}

/**
 * Ask the model to structure the notes, then validate everything it returns:
 * every exercise is re-parsed by the algebra engine, so a hallucinated or
 * garbled problem can never reach Practice as something "checkable".
 * Falls back to the rule-based structure on any failure.
 */
export async function aiStructure(
  config: AiConfig,
  raw: RawDoc,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<LeraDoc> {
  const local = structureDoc(raw);
  const chunks = chunkParas(raw.paras);
  const units: Unit[] = [];
  const glossary: Record<string, string> = {};
  let title = local.title;

  for (let i = 0; i < chunks.length; i++) {
    const messages: ChatMessage[] = [
      { role: 'system', content: STRUCTURE_PROMPT },
      {
        role: 'user',
        content: `File: ${raw.fileName}${chunks.length > 1 ? ` (part ${i + 1} of ${chunks.length})` : ''}\n\n${renderParas(chunks[i])}`,
      },
    ];
    const reply = await chat(config, messages, { json: true, temperature: 0.1, signal });
    const data = extractJson<AiDoc>(reply);
    if (!data || !Array.isArray(data.units)) throw new Error('The AI reply was not in the expected shape.');
    if (i === 0 && typeof data.title === 'string' && data.title.trim()) title = data.title.trim();
    for (const u of data.units) {
      const unit: Unit = { id: `u${units.length + 1}`, title: (u.title ?? '').trim() || `Unit ${units.length + 1}`, topics: [] };
      for (const t of u.topics ?? []) {
        const id = `${unit.id}t${unit.topics.length + 1}`;
        const topic: Topic = { id, title: (t.title ?? '').trim() || `Topic ${unit.topics.length + 1}`, blocks: toBlocks(t.blocks), exercises: [], concepts: [] };
        for (const e of t.exercises ?? []) {
          const instruction = (e.instruction ?? e.text ?? '').trim();
          const math = (e.math ?? '').trim();
          const text = math ? `${instruction}: $${plain(math)}$` : instruction;
          const problem = buildProblem(text, undefined, id);
          if (problem) topic.exercises.push(problem);
        }
        if (topic.blocks.length || topic.exercises.length) unit.topics.push(topic);
      }
      // a unit continued from the previous chunk
      const prev = units[units.length - 1];
      if (prev && prev.title.toLowerCase() === unit.title.toLowerCase()) {
        for (const t of unit.topics) prev.topics.push({ ...t, id: `${prev.id}t${prev.topics.length + 1}` });
      } else if (unit.topics.length) units.push(unit);
    }
    for (const [k, v] of Object.entries(data.glossary ?? {})) {
      if (typeof v === 'string' && k.length <= 40) glossary[k.toLowerCase()] = v;
    }
    onProgress?.((i + 1) / chunks.length);
  }

  const topicCount = units.reduce((n, u) => n + u.topics.length, 0);
  if (topicCount === 0) return local;

  // concepts: reuse the local tagging rules by round-tripping titles and exercises
  const tagged = structureDoc({
    kind: raw.kind,
    fileName: raw.fileName,
    title,
    paras: units.flatMap((u) => [
      { text: u.title, level: 1 },
      ...u.topics.flatMap((t) => [{ text: t.title, level: 2 }, { text: 'placeholder body text for this topic.' }]),
    ]),
  });
  const conceptByTitle = new Map<string, ConceptId[]>();
  for (const u of tagged.units) for (const t of u.topics) conceptByTitle.set(t.title.toLowerCase(), t.concepts);
  for (const u of units) {
    for (const t of u.topics) {
      const fromExercises = [...new Set(t.exercises.flatMap((e) => e.concepts))];
      const fromTitle = conceptByTitle.get(t.title.toLowerCase()) ?? [];
      const titleSpecific = fromTitle.filter((c) => !(fromTitle.length === 2 && fromTitle[0] === 'like-terms' && fromTitle[1] === 'inverse-operations'));
      t.concepts = [...new Set([...titleSpecific, ...fromExercises])].slice(0, 4);
      if (t.concepts.length === 0) t.concepts = fromTitle.slice(0, 2);
    }
  }

  return { ...local, title, units, glossary: { ...glossary, ...local.glossary }, via: 'ai', warnings: [] };
}

/* ───────────── explaining ───────────── */

export async function aiExplain(config: AiConfig, selection: string, context: string, signal?: AbortSignal): Promise<string> {
  return chat(
    config,
    [
      { role: 'system', content: `${VOICE}\nExplain the selected text from the student's own notes in at most 90 words. Start with the idea, then one tiny example. No headings, no lists.` },
      { role: 'user', content: `Topic: ${context}\n\nSelected text:\n"""${selection.slice(0, 900)}"""` },
    ],
    { temperature: 0.3, maxTokens: 300, signal },
  );
}

export interface TutorContext {
  topic?: string;
  problem?: Problem;
  lines?: string[];
  mark?: Diagnosis;
  notesExcerpt?: string;
}

function describe(ctx: TutorContext): string {
  const parts: string[] = [];
  if (ctx.topic) parts.push(`Topic: ${ctx.topic}`);
  if (ctx.problem) parts.push(`Problem: ${ctx.problem.prompt}${ctx.problem.given ? ` — ${ctx.problem.given}` : ''}`);
  if (ctx.lines?.length) parts.push(`Student's working so far:\n${ctx.lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`);
  if (ctx.mark) parts.push(`The checker marked a line: ${plain(ctx.mark.title)} ${plain(ctx.mark.message)}`);
  if (ctx.notesExcerpt) parts.push(`From the student's notes:\n${ctx.notesExcerpt.slice(0, 1200)}`);
  return parts.join('\n\n');
}

export async function aiChat(config: AiConfig, history: ChatMessage[], ctx: TutorContext, signal?: AbortSignal): Promise<string> {
  const system = `${VOICE}
Answer in at most 80 words. If the student asks for the answer to the problem they are solving, give the next idea or a question that leads to it, not the answer.
The algebra checker's verdict in the context below is always right; never contradict it.

${describe(ctx)}`;
  return chat(config, [{ role: 'system', content: system }, ...history.slice(-8)], { temperature: 0.4, maxTokens: 320, signal });
}

/** A second opinion in words for a step the rule-based diagnosis could not name. */
export async function aiDiagnose(config: AiConfig, problem: Problem, prevLine: string, wrongLine: string, signal?: AbortSignal): Promise<Pick<Diagnosis, 'title' | 'message' | 'concept'> | null> {
  const ids = Object.keys(CONCEPTS).join(', ');
  const reply = await chat(
    config,
    [
      {
        role: 'system',
        content: `${VOICE}
A checker has already proved that the student's line does not follow from the line above it. Say what most likely went wrong.
Return ONLY JSON: {"title": string (max 9 words, states the rule), "message": string (max 40 words, names the exact place), "concept": one of [${ids}]}`,
      },
      { role: 'user', content: `Problem: ${problem.prompt} ${problem.given}\nLine above: ${prevLine}\nStudent's line: ${wrongLine}` },
    ],
    { json: true, temperature: 0.1, maxTokens: 220, signal },
  );
  const data = extractJson<{ title?: string; message?: string; concept?: string }>(reply);
  if (!data?.title || !data.message) return null;
  const concept = (data.concept && data.concept in CONCEPTS ? data.concept : problem.concepts[0] ?? 'arithmetic') as ConceptId;
  return { title: data.title, message: data.message, concept };
}

/** For problems the engine cannot check (word problems): a judgement on the student's written answer. */
export async function aiCheckOpen(config: AiConfig, problem: Problem, working: string[], signal?: AbortSignal): Promise<{ correct: boolean; feedback: string } | null> {
  const reply = await chat(
    config,
    [
      {
        role: 'system',
        content: `${VOICE}
Check a student's working for a problem from their notes. Be strict about the maths and kind in tone.
Return ONLY JSON: {"correct": boolean, "feedback": string (max 60 words; if wrong, name the first line that goes wrong and why, without giving the final answer)}`,
      },
      { role: 'user', content: `Problem: ${problem.prompt}\n\nWorking:\n${working.map((l, i) => `${i + 1}. ${l}`).join('\n')}` },
    ],
    { json: true, temperature: 0.1, maxTokens: 260, signal },
  );
  const data = extractJson<{ correct?: boolean; feedback?: string }>(reply);
  if (!data || typeof data.correct !== 'boolean') return null;
  return { correct: data.correct, feedback: data.feedback ?? '' };
}

/**
 * The student said an explanation didn't make sense: say the same point again, more simply.
 * The engine has already decided what went wrong and which idea it belongs to — the model only rewords it.
 */
export async function aiSimplify(
  config: AiConfig,
  input: { concept: ConceptId; title: string; message: string; plain: string; problem?: Problem; line?: string; fix?: string },
  signal?: AbortSignal,
): Promise<string> {
  const c = CONCEPTS[input.concept];
  return chat(
    config,
    [
      {
        role: 'system',
        content: `${VOICE}
The student read the explanation below and said it did not make sense. Explain the SAME point again for a complete beginner:
one everyday picture or one tiny number example, at most 70 words, no new rules, no other topics, and do not give the final answer to their problem.
Idea: ${c.title} — ${c.short}`,
      },
      {
        role: 'user',
        content: `${input.problem ? `Problem: ${input.problem.prompt} ${input.problem.given}\n` : ''}${input.line ? `My line: ${input.line}\n` : ''}What the checker said: ${plain(input.title)} ${plain(input.message)}\nA plain version I was also shown: ${input.plain}`,
      },
    ],
    { temperature: 0.4, maxTokens: 260, signal },
  );
}
