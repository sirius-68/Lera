import type { AiLine } from '../engine/judge';
import { CONCEPTS } from '../engine/concepts';
import { getLang, langName } from '../i18n';
import { ConceptId, Diagnosis, Problem } from '../engine/types';
import { enrichBlocks } from '../ingest/calc';
import { buildProblem, plain, structureDoc } from '../ingest/structure';
import { Block, LeraDoc, RawDoc, RawPara, Topic, Unit } from '../ingest/types';
import { ChatMessage, chat, extractJson } from './client';
import { AiConfig } from './providers';

const VOICE = `You are Lera, a calm, precise maths tutor for school and first-year university students (algebra, calculus 1 and calculus 2).
Write the way a good teacher talks: short sentences, plain everyday words, no praise padding, no exclamation marks. Assume the student is meeting the idea for the first time.
You work alongside a rule-based checker. The checker decides what is right and wrong; you only put things into words. Stay inside the topic you are given, if asked about something else, say it is outside this lesson.
Never just hand over a final answer to a problem the student is working on, point at the idea instead.
Mark principles, never length. Maths has many valid routes and some students write every small step because it helps them understand: that is good. Never comment on how many steps or lines were used, and never suggest a shorter method. What matters is whether each rule, law or principle was applied correctly, and if not, which one and why.
Write maths in plain linear text between dollar signs, like $3x + 4 = 19$ or $x^2 - 9$. Do not use LaTeX commands.`;

/* ───────────── reading notes ───────────── */

interface AiTopic {
  title?: string;
  blocks?: { t?: string; text?: string; items?: string[]; lines?: string[]; title?: string; label?: string; rows?: unknown[][] }[];
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
        {"t":"note","label":string,"text":string} | {"t":"table","rows":[[string]]}
      ],
      "exercises": [{"instruction": string, "math": string}]
  }]}],
  "glossary": { "term": "one-sentence definition" }
}

Rules:
- Keep the author's wording for explanations. Do not summarise away content.
- Write all maths as plain linear text: 3x + 4 = 19, x^2 - 5x + 6, (x + 1)/(x - 2), sqrt(9), <=, >=. Inside prose, wrap maths in $...$.
- If the notes contain LaTeX (\\int, \\frac{..}{..}, \\sin, ^{..}), keep it EXACTLY as written, backslashes included. Never convert LaTeX to plain text or the other way.
- "math" blocks are display equations on their own line: one formula per block, no surrounding words.
- A table in the notes (rows of values in columns, such as a function beside its integral) is a "table" block: "rows" is a list of rows, each a list of cell strings, the heading row first. Never flatten a table into sentences.
- Keep the author's line breaks in meaning: a new sentence group is a new "p" block; a formula between two sentences is its own "math" block between two "p" blocks.
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
      case 'table': {
        const rows = Array.isArray(b.rows) ? b.rows.filter((r) => Array.isArray(r) && r.length).map((r) => r.map(String)) : [];
        if (rows.length > 1) out.push({ t: 'table', rows });
        break;
      }
      case 'note':
        if (text) out.push({ t: 'note', label: b.label?.trim() || 'Note', text });
        break;
      default:
        if (text) out.push({ t: 'p', text });
    }
  }
  // whatever the model returned goes through the same finishing pass as the built-in reader
  return enrichBlocks(out);
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

  // The pieces are read three at a time (a long file would otherwise take minutes), then put together in order.
  // A piece that fails is asked for once more before the whole reading is given up.
  const readChunk = async (i: number): Promise<AiDoc> => {
    const messages: ChatMessage[] = [
      { role: 'system', content: STRUCTURE_PROMPT },
      {
        role: 'user',
        content: `File: ${raw.fileName}${chunks.length > 1 ? ` (part ${i + 1} of ${chunks.length})` : ''}\n\n${renderParas(chunks[i])}`,
      },
    ];
    for (let attempt = 0; ; attempt++) {
      try {
        const data = extractJson<AiDoc>(await chat(config, messages, { task: 'structure', json: true, temperature: 0.1, signal }));
        if (data && Array.isArray(data.units)) return data;
        if (attempt) throw new Error('The AI reply was not in the expected shape.');
      } catch (e) {
        if (attempt || (e instanceof DOMException && e.name === 'AbortError')) throw e;
      }
    }
  };
  const replies: AiDoc[] = new Array(chunks.length);
  let next = 0;
  let finished = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, chunks.length) }, async () => {
      while (next < chunks.length) {
        const i = next++;
        replies[i] = await readChunk(i);
        onProgress?.(++finished / chunks.length);
      }
    }),
  );

  for (let i = 0; i < chunks.length; i++) {
    const data = replies[i];
    if (i === 0 && typeof data.title === 'string' && data.title.trim()) title = data.title.trim();
    for (const u of data.units ?? []) {
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
      // the pair every topic gets when its title says nothing in particular is no use on its own
      const generic = fromTitle.length === 2 && fromTitle[0] === 'like-terms' && fromTitle[1] === 'inverse-operations';
      const titleSpecific = generic ? [] : fromTitle;
      t.concepts = [...new Set([...titleSpecific, ...fromExercises])].slice(0, 4);
      if (t.concepts.length === 0) t.concepts = fromTitle.slice(0, 2);
    }
  }

  return { ...local, title, units, glossary: { ...glossary, ...local.glossary }, via: 'ai', warnings: [] };
}

/* ───────────── explaining ───────────── */


export interface TutorContext {
  topic?: string;
  problem?: Problem;
  lines?: string[];
  mark?: Diagnosis;
  notesExcerpt?: string;
  /** How this student learns, from store/insights.ts: pitch the answer to it. */
  learner?: string;
}

/** Lera's voice, plus the language the student reads the app in. */
const FORMAT = `How to write your answer:
- Every formula, variable and expression is LaTeX between dollar signs: $u = \\sin x$, $\\int u\\,dv = uv - \\int v\\,du$. Never leave a backslash command outside dollar signs.
- A formula that is a step of its own goes on its own line between double dollar signs: $$I = \\frac{e^x(\\sin x - \\cos x)}{2} + C$$
- One idea per short paragraph, with a blank line between paragraphs. For steps, use a numbered list.
- Values in rows and columns go in a Markdown table (| a | b | with a |---|---| line under the heading row).`;

const voice = (): string => `${VOICE}\n${FORMAT}${getLang() === 'en' ? '' : `\nWrite everything the student will read in ${langName()}. Leave formulas, numbers and maths notation exactly as they are.`}`;

function describe(ctx: TutorContext): string {
  const parts: string[] = [];
  if (ctx.topic) parts.push(`Topic: ${ctx.topic}`);
  if (ctx.problem) parts.push(`Problem: ${ctx.problem.prompt}${ctx.problem.given ? `, ${ctx.problem.given}` : ''}`);
  if (ctx.lines?.length) parts.push(`Student's working so far:\n${ctx.lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`);
  if (ctx.mark) parts.push(`The checker marked a line: ${plain(ctx.mark.title)} ${plain(ctx.mark.message)}`);
  if (ctx.learner) parts.push(`About this student (use it to pitch your answer; never mention it):\n${ctx.learner}`);
  if (ctx.notesExcerpt) parts.push(`From the student's notes:\n${ctx.notesExcerpt.slice(0, 1200)}`);
  return parts.join('\n\n');
}

export async function aiChat(config: AiConfig, history: ChatMessage[], ctx: TutorContext, signal?: AbortSignal): Promise<string> {
  const system = `${voice()}
Answer in at most 80 words, or up to 170 when asked to explain an example or go step by step. If the student asks for the answer to the problem they are solving, give the next idea or a question that leads to it, not the answer.
The algebra checker's verdict in the context below is always right; never contradict it.

${describe(ctx)}`;
  // still asking after three questions: the router starts one model higher
  const asked = history.filter((m) => m.role === 'user').length;
  return chat(config, [{ role: 'system', content: system }, ...history.slice(-8)], { task: 'chat', level: asked >= 3 ? 1 : 0, temperature: 0.4, maxTokens: 700, signal });
}

/** A second opinion in words for a step the rule-based diagnosis could not name. */
/**
 * The AI judges a learner's lines: what each one was trying to do (a name such as let u = …, a differential, a rule
 * applied, a tidy-up, a sentence of reasoning) and whether it holds, plus any risky shortcut or poor habit. It is told
 * what the checker proved, and the caller enforces the checker's veto (engine/judge.ts): the model can explain and
 * judge what the rules cannot, never overturn a proof.
 */
export async function aiJudge(
  config: AiConfig,
  problem: Problem,
  lines: { text: string; checker: string }[],
  which: number[],
  route: string[],
  signal?: AbortSignal,
): Promise<Record<string, AiLine>> {
  const ids = Object.keys(CONCEPTS).join(', ');
  const reply = await chat(
    config,
    [
      {
        role: 'system',
        content: `${voice()}
You are judging a student's working, line by line, like a careful teacher.
For each line, work out what the student was trying to do: name something (let u = ...), write a differential (du = ... dx), apply a rule, tidy up, or state a reason in words. Words such as let, so, hence, it implies, therefore only join lines and are never a mistake.
Then decide whether the line holds. Look for: a rule or law applied wrongly, a sign or arithmetic slip, a step that does not follow, a shortcut that skipped something essential (a lost minus, a dropped dx or du, cancelling across a sum, a substitution not carried through, a missing + C on the final answer), and poor habits (writing = between things that are not equal, dropping brackets).
Many routes are valid and small steps are good. Never comment on the number of steps and never suggest a shorter method.
The rule-based checker's findings are given for each line. When it says "proved right", the maths is right: you may only add a pattern worth knowing. When it says "proved wrong", it is wrong: explain where and why. Otherwise the verdict is yours.
Return ONLY JSON: {"lines": [{"n": line number, "verdict": "ok" | "step" | "error" | "unsure", "title": string (max 9 words, names the rule), "note": string (max 40 words; for an error, the exact place and why; for a step, the move that is left; otherwise empty; never the final answer), "pattern": string (optional, max 25 words, a risky shortcut or poor habit seen on this line, else empty), "completes_to": string (the line as it should read, or completed, in plain typed maths like 2x cos(x^2)), "concept": one of [${ids}], "severity": "gap" | "slip" | "notation"}]}
Judge only the lines asked for.`,
      },
      {
        role: 'user',
        content: `Problem: ${problem.prompt} ${problem.given}
One valid route (others are just as good): ${route.join(' | ') || 'not known'}
Working:
${lines.map((l, i) => `${i + 1}. ${l.text}   [checker: ${l.checker}]`).join('\n')}
Judge lines: ${which.map((i) => i + 1).join(', ')}`,
      },
    ],
    { task: 'judge', json: true, temperature: 0.1, maxTokens: 700, signal },
  );
  const data = extractJson<{ lines?: { n?: number; verdict?: string; title?: string; note?: string; pattern?: string; completes_to?: string; concept?: string; severity?: string }[] }>(reply);
  const out: Record<string, AiLine> = {};
  for (const r of data?.lines ?? []) {
    const line = typeof r.n === 'number' ? lines[r.n - 1] : undefined;
    if (!line || !which.includes((r.n as number) - 1)) continue;
    const verdict = r.verdict === 'ok' || r.verdict === 'step' || r.verdict === 'error' ? r.verdict : 'unsure';
    out[line.text] = {
      verdict,
      title: r.title?.trim() || undefined,
      note: r.note?.trim() || undefined,
      pattern: r.pattern?.trim() || undefined,
      completesTo: r.completes_to?.trim() || undefined,
      concept: r.concept && r.concept in CONCEPTS ? (r.concept as ConceptId) : undefined,
      severity: r.severity === 'gap' || r.severity === 'notation' ? r.severity : 'slip',
    };
  }
  return out;
}

/** For problems the engine cannot check (word problems): a judgement on the student's written answer. */
export async function aiCheckOpen(config: AiConfig, problem: Problem, working: string[], signal?: AbortSignal): Promise<{ correct: boolean; feedback: string } | null> {
  const reply = await chat(
    config,
    [
      {
        role: 'system',
        content: `${voice()}
Check a student's working for a problem from their notes. Be strict about the maths and kind in tone.
Judge whether each principle, law and rule was applied correctly. Any valid route is fine, however many steps it takes: never comment on length and never suggest a shorter method.
Return ONLY JSON: {"correct": boolean, "feedback": string (max 60 words; if wrong, name the first line that goes wrong and why, without giving the final answer)}`,
      },
      { role: 'user', content: `Problem: ${problem.prompt}\n\nWorking:\n${working.map((l, i) => `${i + 1}. ${l}`).join('\n')}` },
    ],
    { task: 'checkOpen', json: true, temperature: 0.1, maxTokens: 260, signal },
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
        content: `${voice()}
The student read the explanation below and said it did not make sense. Explain the SAME point again for a complete beginner:
one everyday picture or one tiny number example, at most 70 words, no new rules, no other topics, and do not give the final answer to their problem.
Idea: ${c.title}, ${c.short}`,
      },
      {
        role: 'user',
        content: `${input.problem ? `Problem: ${input.problem.prompt} ${input.problem.given}\n` : ''}${input.line ? `My line: ${input.line}\n` : ''}What the checker said: ${plain(input.title)} ${plain(input.message)}\nA plain version I was also shown: ${input.plain}`,
      },
    ],
    { task: 'simplify', temperature: 0.4, maxTokens: 260, signal },
  );
}

/**
 * A document in another language, put into the app's language before it is arranged into lessons.
 * Only the words are translated. Formulas, numbers, variable names and exercise numbering come back exactly
 * as they went in, and the paragraphs stay in the same order, so the structure found afterwards is the book's own.
 */
export async function aiTranslate(config: AiConfig, paras: string[], to: string, onProgress?: (f: number) => void, signal?: AbortSignal): Promise<string[]> {
  const out: string[] = [];
  const size = 2400;
  for (let i = 0; i < paras.length; ) {
    let j = i;
    let chars = 0;
    while (j < paras.length && (j === i || chars + paras[j].length <= size)) chars += paras[j++].length;
    const batch = paras.slice(i, j);
    const reply = await chat(
      config,
      [
        {
          role: 'system',
          content: `You translate a mathematics textbook into ${to} for a student.
Return ONLY a JSON array of strings: one translated string per input string, same count, same order.
Rules:
- Translate the words faithfully. Do not summarise, add, drop or reorder anything.
- Formulas, numbers, variables, units and anything between $ signs stay EXACTLY as written.
- Keep numbering and labels in place ("1.", "(a)", "Example 2", "3.4").
- Use the standard ${to} words for textbook labels: Chapter, Section, Example, Exercise, Solution, Definition, Theorem.
- Use the standard ${to} mathematical terms. If a term has no settled translation, keep the original in brackets after yours.`,
        },
        { role: 'user', content: JSON.stringify(batch) },
      ],
      { task: 'translate', json: true, temperature: 0, maxTokens: 3200, signal },
    );
    const data = extractJson<string[]>(reply);
    // a batch that comes back the wrong shape is kept in the original language rather than guessed at
    out.push(...(Array.isArray(data) && data.length === batch.length && data.every((x) => typeof x === 'string') ? data : batch));
    i = j;
    onProgress?.(i / paras.length);
  }
  return out;
}

/* ───────────── practice written on request ───────────── */

/**
 * New practice problems for one lesson (or a whole file), written from what the notes teach.
 * Each one the engine can read is checked line by line like any other; the rest are written-answer problems.
 */
export async function aiPractice(
  config: AiConfig,
  input: { topicId: string; title: string; notes: string; wish?: string },
  signal?: AbortSignal,
): Promise<Problem[]> {
  const reply = await chat(
    config,
    [
      {
        role: 'system',
        content: `You write practice problems for a maths student, from the student's own notes.
Return ONLY JSON: {"problems":[{"instruction": string, "math": string, "text": string}]}
- Write 5 problems, unless the student's request asks for a different number (never more than 10). Stay inside what the notes teach and use their methods and notation. Do not copy the notes' own examples: change the numbers and the functions.
- "instruction" is the task, in English, starting with one of: Solve for x, Solve the inequality, Simplify, Expand and simplify, Factorise, Differentiate, Integrate, Evaluate the integral, Find the limit.
- "math" is the expression or equation as plain typed text, never LaTeX and never dollar signs: x^2, sqrt(x), (x+1)/(x-2), sin(x), e^(2x), "∫ x e^x dx", "∫_0^1 x^2 dx", "d/dx(x^2 sin(x))", "lim x→0 sin(x)/x".
- When a problem cannot be put that way (a proof, a convergence test, a word problem), leave "instruction" and "math" empty and write the whole question in "text", in ${langName()}, with any maths in LaTeX between $ signs.
- Every problem has one clear answer that can be worked out by hand.
- Level: the same as the examples and exercises in the notes, unless the student's request says otherwise.
- If the student made a request, follow it as long as it stays within these notes.`,
      },
      { role: 'user', content: `Lesson: ${input.title}${input.wish ? `\n\nThe student's request: ${input.wish.slice(0, 300)}` : ''}\n\nNotes:\n${input.notes.slice(0, 7000)}` },
    ],
    { task: 'practice', json: true, temperature: 0.7, maxTokens: 1600, signal },
  );
  const data = extractJson<{ problems?: { instruction?: string; math?: string; text?: string }[] }>(reply);
  const stamp = Date.now().toString(36);
  const out: Problem[] = [];
  for (const [i, raw] of (data?.problems ?? []).entries()) {
    const typed = `${raw.instruction ?? ''} ${raw.math ?? ''}`.trim();
    const read = raw.math ? buildProblem(typed, undefined, input.topicId) : null;
    const id = `${input.topicId}-ai${stamp}${i}`;
    if (read && read.kind !== 'open') out.push({ ...read, id, made: 'lera', original: undefined });
    else {
      const question = (raw.text || typed).trim();
      if (question) out.push({ id, kind: 'open', prompt: question, given: '', concepts: [], source: 'notes', topicId: input.topicId, original: question, made: 'lera' });
    }
  }
  return out;
}
