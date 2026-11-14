# Lera

**Learning Enhanced by Recursive Analysis** — an algebra tutor that reads your notes and your working.

Upload a PDF or Word file of algebra notes. Lera turns it into an interactive table of contents and lessons, pulls every exercise it finds into **Practice**, and then checks your working *line by line*. When a line doesn't follow, it says which rule broke, tells a real gap from a slip, links a three-minute review, and brings that idea back on later days until it holds.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, rebuilds and reloads on save
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with live reload |
| `npm test` | 75 tests: algebra engine, file reading, learner model, AI client |
| `npm run build` | Production build into `dist/` (static files, host anywhere) |
| `npm run preview` | Build, then serve `dist/` on http://localhost:4173 |
| `npm run build:single` | Everything in one file: `dist-single/lera.html` (plus `lera-embed.html`, the same app without the document wrapper) |
| `npm run typecheck` | TypeScript, no emit |

Needs Node 20 or newer. The bundler is esbuild (see `scripts/`); there is no framework beyond React.

Sample notes to try are in `samples/` (a Word file, a PDF, and one PDF whose equations are pictures, to see the warning).

## How it works

```
file ──► ingest/ ──► LeraDoc (units → lessons → blocks + exercises + glossary)
                         │
          lesson reader ◄┴► practice session
                               │  each line you write
                               ▼
                         engine/analyze ──► ok / wrong / carried / recovered
                               │  wrong line
                               ▼
                         engine/diagnose ──► which rule, gap or slip, corrected line
                               │
                               ▼
                         store/learner ──► review queue, mastery, insights
```

**Reading files (`src/ingest`)** — Word files are unzipped and the XML is read directly, so heading styles, lists, superscripts and equation-editor maths all survive. PDFs are read with pdf.js: lines are rebuilt from glyph positions, raised glyphs become powers, running headers are dropped and font sizes become heading levels. A rule-based pass then builds units, lessons, worked examples, callouts, a glossary, and exercises (instructions such as "Solve each equation:" are inherited by the numbered items under them).

**Checking algebra (`src/engine`)** — no AI involved. A parser turns each line into a tree; exact rational arithmetic and polynomial normal forms decide whether a line is equivalent to the one above *and* to the original problem. For a wrong line the engine applies known wrong moves (sign kept when a term crosses over, bracket half-expanded, powers multiplied instead of added, inequality not flipped, lost root, …) to the previous line and sees which one reproduces what the student wrote.

**The recursive part (`src/store/learner.ts`)** — a *gap* stays outstanding until the idea is solved cleanly on two different days; a *slip* is only noted, unless the same kind recurs on three days. Cleared ideas come back at widening intervals. Sessions put what is due first, then the exercises from your notes, then generated problems.

**Lera herself (`src/mascot`)** — one SVG. She breathes, blinks irregularly, follows the pointer with her eyes, glances around when idle, dozes off, reacts to taps (try tapping five times quickly), and changes mood with what happens in a session.

## Adding an AI model (optional, free options)

Everything above works with no AI. A model adds three things: tidier lessons from messy files, open questions in **Ask Lera**, and marking of word problems. Set it up in the app under **Settings → AI assistant**; any OpenAI-compatible endpoint works.

| Provider | Why | Get a key |
| --- | --- | --- |
| **Google Gemini** (recommended for testing) | Free tier, no card, large context for long notes | https://aistudio.google.com/apikey |
| **Groq** | Free plan, very fast replies | https://console.groq.com/keys |
| **OpenRouter** | One key, many models; pick one ending in `:free` | https://openrouter.ai/keys |
| **Ollama** | Runs on your own computer: no key, no limits | https://ollama.com |

Free limits and model names change often — use **List** in Settings to load the provider's current models. On Gemini's free tier, Google may use requests to improve its products, so don't send anything private.

**Keys.** In development the key is typed into Settings and stored in the browser. Don't ship that: a key in a public web page can be copied by anyone. For a deployed app, put the key on a server — `scripts/server.mjs` includes a small proxy:

```bash
# .env
LERA_AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LERA_AI_KEY=your-key
```

then choose **Other** in Settings with the address `/api/ai` and a model name. (The built-in "Other" option expects a key; type any placeholder — the proxy replaces it.)

Whatever a model returns is treated as a suggestion: exercises it extracts are re-parsed by the engine, and it never decides whether a line of algebra is right.

## What is real and what is a placeholder

Real: reading PDF/DOCX/TXT/Markdown, the table of contents and lessons, highlights (8 colours, underline), notes, saved passages, glossary pop-ups, Ask Lera (built-in answers offline), practice with line-by-line checking, diagnosis with review links, three-rung hints, route comparison, the review queue, progress and insights. All data stays in the browser (localStorage).

Placeholders: account sign-in (a name is stored locally), the 7-day trial and prices (nothing is charged), push reminders (permission is requested but nothing is scheduled), and the Russian and French interface (the choice is saved; the UI is English).

Known limits: scanned PDFs and equations stored as pictures can't be read (Lera says so); PDFs carry no equation markup, so inline maths from a PDF is shown as text rather than typeset; systems of equations get a generic diagnosis; word problems are only marked when a model is connected.

## A note on how this was built

The first version was written in a sandbox with no access to the npm registry. It was bundled, tested (`npm test`) and driven end to end in headless Chromium there, using packages already on the machine at the versions pinned in `package.json`. Two things could not be run in that environment and are worth doing once on your machine: a clean `npm install`, and `npm run typecheck` against the real React type packages. Live calls to the AI providers were also not possible there; the client is tested against a local stand-in server (`src/ai/__tests__`).

## Layout

```
src/engine    parser, exact arithmetic, checker, diagnosis, solution steps, concept library, problem generators
src/ingest    DOCX and PDF readers, structuring into lessons and exercises
src/ai        optional OpenAI-compatible client, prompts, built-in answers
src/store     app state, learner model, navigation
src/mascot    Lera
src/ui        buttons, sheets, maths typesetting, icons
src/screens   onboarding, home, lessons, reader, practice session, progress, settings
scripts       build, dev server, static server + AI proxy
samples       notes to try
```
