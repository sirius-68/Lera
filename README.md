# Lera

**Learning Enhanced by Recursive Analysis** — a maths tutor for algebra and calculus 1–2 that reads your notes and your working.

Upload a PDF or Word file of algebra or calculus notes. Lera turns it into a learning path of lessons, rebuilds the graphs it names as interactive ones, pulls every exercise it finds into **Practice**, and then checks your working *line by line* — as you write, or all at once when you finish. When a line doesn't follow, it says which rule broke, tells a real gap from a slip, links a three-minute review, and brings that idea back on later days until it holds.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, rebuilds and reloads on save
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with live reload |
| `npm test` | 87 tests: algebra and calculus engines, file reading, learner model, AI client |
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

## Calculus (`src/engine/calc`)

Derivatives, integrals and limits can't be put into an exact normal form the way polynomials can, so calculus has its own small engine: a parser for `d/dx`, `∫`, `lim`, sin, ln, eˣ; a symbolic differentiator; a table-driven integrator (powers, the standard table, a linear inside, substitution, tabular by-parts); and numeric limits and definite integrals. A line is right when it equals the answer at a spread of points — for an integral, when *its derivative* equals the integrand, so any correct antiderivative is accepted. Wrong lines are named by applying each rule the way it is commonly misapplied (power kept, product rule skipped, inside forgotten, sign on cos, no "divide by the new power", limits subtracted the wrong way round, 0/0 read as 0 …) and seeing which one reproduces the student's line.

Not covered yet: series and convergence tests, partial fractions, trigonometric substitution. Exercises of those kinds stay as written-answer problems.

## Graphs

When the notes say something like "the graph of y = x² − 4 is a parabola", or a Word file has a picture next to such a sentence, the lesson shows an interactive graph of that function: drag, pinch, tap the curve for a point and its slope, and switch on the derivative. Any display equation of the form `y = …` gets a **Graph it** button. The graph is rebuilt from the *function named in the text*; reading a curve out of a picture with no equation beside it would need a vision model.

## The AI model (optional, set at build time)

Everything above works with no AI. A model adds: tidier lessons from messy files, open questions in **Ask Lera**, marking of word problems, and a simpler re-explanation when a student says one didn't make sense. It is never the judge: every exercise it extracts is re-parsed by the engine, every block it returns goes through the same finishing pass as the built-in reader, and it is told which idea it is talking about and to stay inside it.

There is no key screen in the app. Set these when building (in GitHub Actions: repository secrets with the same names):

```bash
LERA_AI_BASE_URL=https://your-proxy.example.com/v1   # any OpenAI-compatible endpoint
LERA_AI_MODEL=model-name
LERA_AI_KEY=                                         # leave empty if the proxy holds the key
```

Anything built into an app can be extracted from it, so for a public release point `LERA_AI_BASE_URL` at your own server and keep the provider key there. `scripts/server.mjs` includes a small proxy (`/api/ai`) that does this.

## Android

`.github/workflows/android-apk.yml` typechecks, tests, builds the web app, wraps it with Capacitor and uploads a debug APK on every push to `main` or `android-apk`. `android-overrides/LeraWebView.java` keeps Android's own Copy/Share menu from appearing over Lera's text toolbar; `MainActivity.java` shrinks the page when the keyboard opens so the field being typed in stays visible. Reminders are local notifications (`@capacitor/local-notifications`, `src/store/remind.ts`), scheduled on the phone.

## Lera's moods, celebrations and the widget

`src/mascot/Lera.tsx` draws one character with fifty moods. Thirty of them are rows in a table (`LOOKS`) that combine parts — eyes, brows, mouth, hands, something worn or held, a tint, an effect — and when she is left alone she falls asleep and dreams in formulas. `src/ui/Celebrate.tsx` holds the full-screen scenes shown after a session (complete, streak, daily goal, level up), at the end of a chapter and inside the onboarding.

The Android home-screen widgets are native (`android-overrides/StreakWidget.java`, small and wide). Lera's mood, the background and the line change with how long she has been ignored: through the day while the streak is alive, then by days, a week, a month and a year once it breaks. Some states fill the whole card with her face. Tapping her makes her react; tapping the card opens Practice. **Test mode** (off by default; the switch is on the Streak page) climbs the whole ladder one step a minute after the app is left, so every state can be seen quickly. The pictures and the app icon are generated by `scripts/widget-art.py` (then `node scripts/icon-png.mjs` for the PNG icons); the app hands the widgets their numbers through `window.LeraNative` (`WidgetBridge.java`, `src/store/widget.ts`).

## Maths that is set in two dimensions

A PDF only says where each piece of text sits, so a stacked fraction read row by row falls apart. `src/ingest/layout2d.ts` puts it back before rows are formed: a short piece directly above another, with full-size text on the line between them, is a fraction; big brackets and dots that a symbol font reports as letters (`c … m`, `$`) are restored; the small numbers written beside crossed-out factors go, along with a row that is only cancelling. Formulas set on rows of their own keep their rows (`steps`) and the name printed beside them (`caption`), and are typeset as written (`writtenLatex`) rather than tidied by the engine.

## Profiles

`src/store/auth.ts` keeps a profile on the device: the email and a salted PBKDF2 hash of the password, which locks the app after signing out. Build with `LERA_AUTH_URL` set and the same screens call that server instead (`POST /signup`, `/signin`, `/reset`).

## Books and long files

`src/ingest/toc.ts` decides what is a chapter and what is a section the way a PDF reader does: the file's own outline first, then a printed contents page, then heading numbering, then type size. Cover, copyright, contents, preface and index pages are left out. Lessons are shown one sub-topic per page (`paginate` in `src/screens/Lesson.tsx`), and uploaded notes are stored in IndexedDB (`src/store/docdb.ts`) so a 400-page book does not hit the localStorage limit. Chats with Lera are kept per topic in the saved state.

## What is real and what is a placeholder

Real: reading PDF/DOCX/TXT/Markdown, the learning path and lessons, interactive graphs, highlights (8 colours, underline), notes and saved passages in the Notebook, glossary pop-ups, Ask Lera (built-in answers offline), practice with line-by-line or check-at-the-end marking, diagnosis with review links, three-rung hints, route comparison, the review queue, weak-spot analysis, XP, levels, streaks and badges. All data stays on the device (localStorage).

Placeholders: account sign-in (a name is stored locally), push reminders (permission is requested but nothing is scheduled), and the Russian and French interface (the choice is saved; the UI is English).

Known limits: scanned PDFs and equations stored as pictures can't be read (Lera says so); PDFs carry no equation markup, so inline maths from a PDF is typeset only where it contains a power; graphs are rebuilt from a function named in the text, not from the picture itself; the system text menu is only suppressed in the Android app, not in a browser; systems of equations get a generic diagnosis; word problems are only marked when a model is connected.

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
