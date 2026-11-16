# Lera backend: what the server and its AI model should do

The app works with no server. Everything below is optional help that a backend can add, and the rules a model
must follow so that its output drops into the app without breaking it. The app always checks what comes back
and falls back to its own engine when the answer doesn't fit.

Build settings that switch these on:

| Setting | What it does |
|---|---|
| `LERA_AI_URL` | The address of Lera's AI router (`backend/`), which holds the keys and picks a model per job. See `backend/README.md` |
| `LERA_AUTH_URL` | Profiles on a server instead of on the phone (section 4) |

---

## 1. Who does what

| Job | On the phone (always) | On the server (when connected) |
|---|---|---|
| Checking a line of working | The maths engine. **Its verdict is final.** | Never overrides it. May add words when the engine can't name the mistake. |
| Reading a PDF or Word file | Glyph positions to lines, fractions rebuilt, contents found, lessons built | Structures hard books better (section 2) |
| Explaining | Built-in explanations and hints | Rewrites in plainer words, answers questions |
| Knowing the learner | The learner model (section 5) | Stores it across devices, uses it in prompts |

A model must **never** decide whether maths is right. It gets the engine's verdict in its context and explains it.

---

## 2. Structuring a book

### 2.1 What the server receives

Do the text extraction on the phone (it already rebuilds fractions and powers) and send paragraphs, not the PDF:

```json
{
  "fileName": "algebra-2.pdf",
  "pages": 412,
  "outline": [{ "title": "Chapter 1: Going Beyond Beginning Algebra", "level": 1, "page": 25 }],
  "paras": [
    { "text": "Chapter 1", "page": 25, "scale": 1.3 },
    { "text": "Going Beyond Beginning Algebra", "page": 25, "scale": 2.0 },
    { "text": "12((1/2) + (2/3) - (3/4))", "page": 31, "math": true, "rows": ["12((1/2) + (2/3) - (3/4))", "= 12 * (1/2) + 12 * (2/3) - 12 * (3/4)", "= 6 + 8 - 9", "= 5"] }
  ]
}
```

`scale` is the type size relative to body text (1 = body). `outline` is the file's own bookmarks, often empty.
`paras` is `RawPara[]` from `src/ingest/types.ts`.

### 2.2 How to work through it (do not send the whole book in one prompt)

1. **Pass 1, the map.** Send only: the outline, every paragraph with `scale > 1.05`, and the first 15% of pages
   in full. Ask for the table of contents as JSON: `[{ "title", "level", "page" }]` with `page` as the **file's**
   page number. This is cheap and decides everything else.
2. **Pass 2, one chapter at a time.** For each chapter, send its paragraphs (from its page to the next
   chapter's) and ask for that chapter's lessons (2.4). Chapters can run in parallel.
3. **Stitch.** Concatenate the chapters in order. Give every topic and exercise a stable id.

### 2.3 Rules for the map (pass 1)

These are the same rules `src/ingest/toc.ts` follows. A model should apply them in this order.

1. **Trust the file's outline first**, if it has three or more real entries.
2. **Otherwise find the printed contents pages.** They are near the front, and most of their lines are
   "title … page number". There may be two lists: a short one ("Contents at a Glance") and the full one. Use
   the full one; never list a chapter twice.
3. **Printed page numbers are not file page numbers.** The book's "page 1" comes after the cover and the
   contents. Find two or three chapter headings in the text, compare their file page with the printed number,
   and add that difference to every entry. Blank pages left out of the file can shift the difference later in
   the book: re-check it at each chapter.
4. **Place chapters by page, then confirm by text.** A chapter starts on its page even if its heading is split
   over two lines ("Chapter 3" above the title), set as a picture, or worded slightly differently.
5. **Levels.** `Chapter N` (or the first level of numbering, `3`) is level 1. Sections inside it (`3.2`, or
   the lines indented under a chapter in the contents) are level 2. Their sub-headings are level 3.
6. **These are not lessons. Leave them out entirely:**
   - cover, title page, copyright page, dedication, "about the author";
   - the contents pages themselves;
   - preface, foreword, acknowledgements, and an "Introduction" that comes before Chapter 1 and is about the
     book rather than the subject;
   - **part dividers** ("Part II: Facing Off with Functions"): a part groups chapters, it is not a chapter;
   - index, bibliography, answers-only appendices, adverts.
7. **Running heads and feet are not headings.** The chapter's name repeated in small type at the top or bottom
   of every page, with a page number, must be dropped wherever it appears.
8. **With no contents at all**, use numbered headings (`2.3 The Chain Rule`), then type size. A size used only
   once or twice in a long book is a title page, not a level.

### 2.4 What comes back (pass 2)

Exactly the shape of `LeraDoc` in `src/ingest/types.ts`:

```json
{
  "title": "Algebra II",
  "units": [{
    "title": "Going Beyond Beginning Algebra",
    "topics": [{
      "title": "Distributing a wealth of values",
      "blocks": [
        { "t": "p", "text": "The **distributive property** states that you can multiply each term … $a(b + c)$ …" },
        { "t": "math", "text": "a(b + c) = a * b + a * c", "caption": "Distributing multiplication over addition" },
        { "t": "math", "text": "12((1/2) + (2/3) - (3/4))", "steps": ["= 12 * (1/2) + 12 * (2/3) - 12 * (3/4)", "= 6 + 8 - 9", "= 5"] },
        { "t": "h", "text": "A sub-heading inside the lesson" },
        { "t": "list", "ordered": false, "items": ["…"] },
        { "t": "example", "title": "Example 1", "lines": ["Solve $3x + 4 = 19$.", "$3x = 15$", "$x = 5$"] },
        { "t": "note", "label": "Remember", "text": "…" },
        { "t": "graph", "text": "caption", "fns": ["x^2 - 4"] }
      ],
      "exercises": [{ "instruction": "Solve for x", "math": "2x + 6 = 14" }]
    }]
  }],
  "glossary": { "coefficient": "The number multiplying a variable." }
}
```

### 2.5 Rules for lessons

**Size and order**

- A **unit is a chapter**. A **topic is one lesson**: one section of a chapter.
- A lesson is read in one sitting: aim for **2,000 to 6,000 characters** of text. If a section is longer,
  split it at its sub-headings into several lessons, each named after its sub-heading. If it has no
  sub-headings, split at a paragraph and name the pieces "Title · part 2". **Never** produce a lesson longer
  than about 11,000 characters.
- A few opening lines before a chapter's first section ("In this chapter…") go at the top of the first lesson,
  not in a lesson of their own.
- Keep the book's order. Start at chapter one, lesson one.
- Every chapter in the map must appear. If a chapter comes back empty, say so in `warnings`; do not skip it
  silently.

**Words**

- Keep the author's wording. Do not summarise, shorten or "improve" explanations. Do not add content.
- Fix only extraction damage: a word split by a hyphen at a line end, a stray page number in a sentence.
- Bold a term where the book introduces it: `**distributive property**`.

**Maths (this is where books break)**

- Write maths as plain linear text the engine can parse:
  `3x + 4 = 19`, `x^2 - 5x + 6`, `x^(n-1)`, `sqrt(9)`, `abs(x - 2)`, `<=`, `>=`, `*` for a dot,
  `d/dx(x^2 sin(x))`, `∫ (2x + cos(x)) dx`, `∫[0, 2] (3x^2) dx`, `lim x→2 ((x^2 - 4)/(x - 2))`.
- **Fractions always in their own brackets:** `(1/2)`, `((x + 1)/3)`. Never `12 * 1/2`: write `12 * (1/2)`.
- A stacked fraction that arrives broken (numerators on one line, denominators on the next, e.g.
  `12 c 1 + 2 − 3 m` then `2 3 4`) must be rebuilt: `12((1/2) + (2/3) - (3/4))`. Big brackets sometimes
  arrive as the letters `c … m`, and a multiplication dot as `$`: put the brackets and the dot back.
- **Cancelling** (numbers crossed out with small numbers beside them) cannot be shown in text. Drop that row;
  keep the row before it and the result after it.
- Inside a sentence, wrap maths in `$…$`.
- A formula on its own line is a `math` block. If the book prints a name beside it, put the name in
  `caption`. Working that runs over several lines is **one** `math` block: the first line in `text`, each
  following line (starting with `=`) in `steps`.
- If a formula cannot be recovered with confidence, keep the original text in a `p` block. Never guess.

**Examples and exercises**

- A worked example (a question with its solution shown) is an `example` block, one step per line.
- Anything the reader is meant to do is an `exercise`, never a block. `instruction` is the task in words
  ("Solve for x", "Simplify", "Factorise", "Differentiate", "Integrate", "Find the limit", "Evaluate when
  x = 2"); `math` is only the expression or equation.
- A word problem with no single expression: the full text in `instruction`, `math` empty.
- Do not invent exercises. A lesson with none is fine: the app then shows no Practice tab for it.

**Graphs**

- When the text names a function and talks about its graph, add a `graph` block with the function in `fns`.

### 2.6 What the app checks when the answer arrives

- Every `math`, `steps` and exercise `math` string is parsed by the engine. One that doesn't parse is shown as
  plain text (blocks) or dropped (exercises).
- Lessons over the size limit are split again on the phone.
- An empty or malformed answer for a chapter falls back to the built-in reader for that chapter, with a note
  to the user.

---

### 2.7 Every kind of thing in a book, and where it goes

The model must put each paragraph of a chapter into exactly one of these. Nothing is dropped except the items marked "left out".

| What it is | How to recognise it | Where it goes in `LeraDoc` |
|---|---|---|
| Chapter | In the contents, or a large numbered heading ("Chapter 3", "3 Exponents") | a `unit` |
| Heading (section) | Numbered one level down ("3.2"), or a clearly larger line | a `topic` (one lesson) |
| Subheading | Bold or slightly larger line inside a section | `{ t: 'h' }` inside the lesson; starts a new lesson only if the lesson is already long (2.5) |
| Reference text | Ordinary explanation | `{ t: 'p' }`, with maths marked inline as `$...$` |
| Definition, theorem, rule, tip, warning | A labelled box or a line starting "Definition", "Theorem", "Note", "Remember" | `{ t: 'note', label, text }` with the book's own label |
| Formula | A displayed line that is only maths and is being stated, not solved | `{ t: 'math', text, caption? }` |
| Equation being worked | Several displayed lines that follow from each other | one `{ t: 'math', text, steps: [...] }`, steps in order |
| Example | "Example 3", "Worked example", a question followed by its solution | `{ t: 'example', title, lines }`: line 1 is the question as asked, then one line per step, each with its reason if the book gives one |
| Exercise | Under "Exercises", "Practice", "Problems", "Try it", or numbered questions with no solution after them | a `Problem` in `topic.exercises`, **in the order printed**, with the book's own numbering kept in `prompt` |
| Answer key | "Answers", "Solutions to exercises", usually at the end | not a lesson: match each answer to its exercise by number and store it on that problem |
| Graph | A figure of a function, with its caption | `{ t: 'graph', text: caption, fns: [the functions it shows] }`. If the function cannot be read from the text around it, keep the caption as a `note` and say a figure was here |
| Table | Rows and columns of values | `{ t: 'list' }` with one row per item, or a `note` if it is a table of rules |
| Front and back matter, page furniture | Cover, copyright, preface, index, running heads, page numbers | left out |

Two rules the app depends on:

- **Order is the book's order.** Units, lessons, blocks and exercises come back in the order they are printed. Practice shows a lesson's exercises top to bottom; nothing is sorted by difficulty or shuffled.
- **Examples can be practised.** The app puts "Try it myself" and "Explain it" under every example. For that, line 1 of an example must be the complete question on its own ("Solve 3x + 4 = 19", not "Solve the following"), with any shared instruction written into it.

### 2.8 A book in another language

The app has a language (English, French or Russian; `profile.language`, sent with every request as `lang`). When a file is in a different language:

1. The app notices (it compares the file's words with the app's language) and **asks the person first**: "This file is in Russian. Your app is in English. Translate it to English first?" Nothing is translated without a yes.
2. On yes, the paragraphs go to the server for translation **before** structuring, so headings such as "Глава 3" or "Exercices" are found by the same rules as English ones. Lines that are only a formula are not sent.
3. Translation rules, in the order they matter:
   - Faithful, complete, in the same order. No summarising, no added explanation, nothing dropped.
   - Formulas, numbers, variable names, units and anything between `$` signs come back exactly as sent.
   - Numbering and labels stay in place ("1.", "(a)", "3.4").
   - Textbook labels use the standard word in the target language (Chapter, Section, Example, Exercise, Solution, Definition, Theorem).
   - Mathematical terms use the standard term in the target language. Where there is no settled one, keep the original in brackets after the translation.
   - One string in, one string out, same count. A batch that comes back the wrong length is rejected and the original kept.
4. If the answer is no, or the AI is not connected, the file is kept in its own language and the person is told.

The call in the app is `aiTranslate` in `src/ai/tasks.ts`; the question is asked in `src/screens/Upload.tsx`.

### 2.9 The app's language in every answer

Every tutor prompt ends with the app's language ("Write everything the student will read in French. Leave formulas, numbers and maths notation exactly as they are."). A backend that builds its own prompts must do the same from `lang`, including for hints, diagnoses, simplified explanations and chat. Notation is never localised: `sin`, `ln`, `dx` and decimal points stay as the book has them.

## 3. Tutor calls (already in the app)

`src/ai/tasks.ts` sends OpenAI-style chat requests: `aiChat`, `aiExplain`, `aiDiagnose`, `aiSimplify`,
`aiCheckOpen`. Each puts in the system prompt: the topic, the problem, the student's lines so far, **the
engine's verdict on them**, an excerpt of the notes, and the learner summary from section 5.

Rules for the model:

- At most 80 words in chat. Plain words first; the term afterwards.
- Never give the final answer to the problem being solved. Give the next idea or a question that leads to it.
- Never contradict the engine's verdict.
- Always end an explanation by checking it landed ("Does that make sense?"); if the student says no, say it
  again more simply with one small example.
- No long dashes in replies.

---

## 4. Profiles

With `LERA_AUTH_URL` set, the sign-in screens call:

| Call | Body | Does |
|---|---|---|
| `POST /signup` | `{ email, password, name }` | Creates the profile |
| `POST /signin` | `{ email, password }` | Signs in |
| `POST /reset` | `{ email }` | **Emails a 6-digit code**, valid for 10 minutes |
| `POST /reset/confirm` | `{ email, code, password }` | Sets the new password if the code is right; a code works once |

All answer `{ "ok": true }` or `{ "error": "words to show the user" }`. Store only a salted, slow hash of the
password. Until this exists, the app shows the reset code on screen and says why.

---

## 5. Knowing the learner

### 5.1 What the app records

1. **Every attempt** (`AttemptRecord` in `src/store/types.ts`): the problem, each line written with its status,
   every mistake named (code, concept, gap or slip), hints taken, seconds spent, and the route taken.
2. **Events** (`LearnEvent`): `open`, `onboarded`, `lesson`, `session_start`, `session_end`, `hint`, `reveal`,
   `answer_only`, `ask`, `sense`, `widget`, `celebrate`, `upload`. Each has a time and at most a few small values.
   The last 600 are kept.
3. **Onboarding answers** on the profile: subjects, where they study, why they are here, how maths feels,
   what trips them up, check mode, daily goal, study time.

### 5.2 What is worked out from it

`learnerModel()` in `src/store/insights.ts` returns:

| Field | Meaning |
|---|---|
| `habits` | When practice really happens (by time of day and hour), days a week, minutes and problems a day, streak, days since last practice |
| `skill` | Share of recent problems solved cleanly, whether that is rising or falling, median time per problem, level 1 to 5 |
| `style` | How often hints are taken, how often the solution is shown, whether mistakes are **careless** (slips) or **conceptual** (gaps), steps written against the shortest route, how often only the answer is given, how many questions are asked |
| `topErrors` | The five mistakes made most |
| `weakest`, `strongest` | Concepts still open, and those that hold |
| `motivation` | Goal, stated struggle, how maths feels, stage |
| `risk` | Low, medium or high chance of drifting away |
| `next` | What to offer now (review, weak spot, lesson, practice or rest), why, how many problems, when to remind, and the tone to use |

`learnerContext()` turns that into a few lines for a system prompt. It carries **no name and no email**.

### 5.3 What a backend should add

- `POST /events` with `{ userId, events: LearnEvent[], attempts: AttemptRecord[] }`, sent in batches when the
  app is opened and after each session. Idempotent on `(userId, at, t)` and attempt `id`.
- `GET /learner` returning the same `LearnerModel` shape, computed over the full history (the phone only keeps
  recent events), so a second device starts where the first left off.
- Optional: a nightly job that writes tomorrow's reminder text and three quests per user (5.4).

### 5.4 How the model should use it

- **Pitch.** `skill.level` and `style.mistakes` decide how to explain: careless → ask for one more check, do
  not re-teach; conceptual → the rule from the start with one small example.
- **Tone.** `next.tone`: gentle (small steps, reassurance), coach (direct, warm) or challenge (offer the
  harder route).
- **What to bring up.** `topErrors` and `weakest`, tied to the lesson that teaches them.
- **When.** Reminders at `next.remindAt`, around `habits.usualHour`. One a day at most.
- **How much.** `next.problems` per sitting. Short sets that end are better than long ones that are abandoned.

### 5.5 Keeping people coming back, honestly

The app is meant to be something people want to open: streaks, three small quests a day, celebrations,
a widget whose mood follows the streak. Keep it on the right side of the line:

- Quests are finishable in one short sitting and **stop** when done. After the daily goal, `next.action` is
  `rest` and the app says so.
- Never invent urgency that isn't real. "Your streak ends tonight" only when it does.
- A lapsed learner gets a gentle message and an easy way back (one problem), not guilt.
- No reminders at night. Respect "off".

### 5.6 Privacy

- Send events and attempts only for a signed-in user who has agreed to it.
- Prompts get `learnerContext()`, never the email or the name.
- Let the user export and erase everything (the app already has both for local data; the server needs the same).
