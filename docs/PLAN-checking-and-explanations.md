# Plan: fair marking of step-by-step working, full step-by-step explanations, and the written-answer screen

Written 17 Nov 2026 for whoever implements it next. Nothing in this file has been built yet.
It covers four faults reported from the phone, each reproduced in the code before being written down here.

## What the learner asked for

1. **Mark the principle, not the number of steps.** Maths has several valid routes, and some people write every
   small step because it helps them understand. A correct solution written in small steps must never be flagged,
   and Lera must never tell anyone to use a shorter method. A mark is for a rule that was broken or left undone.
2. **Understand what each line is trying to do.** The AI should help read the learner's intent.
3. **Explanations broken into the smallest possible steps**, with the reason in words at each one (the way a
   good worked solution reads: take the constant out, state the rule, say what n is here, apply it, tidy up).
4. **The written-answer screen** must use the maths keyboard and the same line boxes as normal practice.

## The four faults, with their causes

### A. A correct step-by-step solution is flagged as a gap

Reproduce:

```ts
analyze(problem('Integrate ∫ 3x^2 dx'), ['3x^(2+1)', '3x^3/3', 'x^3 + C'])
// today: line 1 → wrong (gap: "Divide by the new power.", fix "x^3 + C"), line 2 → recovered, line 3 → ok
```

Cause, in `src/engine/calc/check.ts`:

- `calcAnalyze` judges every line with `truth(p, side)`. For an integral that asks "does this line differentiate
  back to the integrand?". A line is therefore either the finished antiderivative or wrong. A line that has done
  the first half of a rule and not yet the second (power raised, not yet divided) is not the antiderivative, so
  it is marked wrong the moment it is written.
- `diagnose` then names the missing half as a gap, and `fixText(p)` offers the **final answer** as "This line
  should read", which is what makes it look as if Lera wants the short method.

Lines that keep the operator are already handled well (`3 ∫ x^2 dx` → ok). The fault is only with lines that
apply part of a rule.

Algebra is not affected in the same way: every line of an equation or a simplification is equal to the one
above, so small steps are all true. Check it anyway with the tests below.

### B. Lera comments on the length of a solution

Cause, in `src/engine/analyze.ts` (around the `long-way` mark): when a solved attempt has many more lines than
the engine's own route, a `strategy` mark "Right answer, long road." is added. Related wording lives in
`src/store/learner.ts` (`insights`: "You write about N× as many lines as the shortest route") and in
`src/screens/Session.tsx` ("Solved, with a detour", "Clean route").

### C. Explanations are one line

Reproduce: "Show the whole solution" on `∫ x e^(2x) dx` shows a single step: the final answer and one paragraph.

Cause, in `src/engine/calc/check.ts`: `integralSteps` returns exactly one `SolutionStep` (`tag: 'final'`).
`definiteSteps` adds two more to it. `derivativeSteps` and `limitSteps` are better but still coarse.
`src/engine/calc/integrate.ts` returns only `{ F, how, u }`, so the route it took (which part was u, what du
and v were, the integral left over) is thrown away before anyone can show it.

### D. The written-answer screen, and questions that should not be written answers

- `OpenWork` in `src/screens/Session.tsx` draws a plain `<textarea>`, so the phone's own keyboard opens and the
  line boxes, the maths keyboard and the formula drawing are all missing.
- The question in the screenshot ("Evaluate the integral of 2x cos(x^2). Let u = x^2, du = 2x dx.") is a normal
  integral. It became a written answer because `buildCalcProblem` (`src/ingest/calc.ts`) only recognises an
  integral written with `∫`, not "the integral of …" in words. The example's own first line of working
  ("Let u = …") was also taken as part of the question (`exampleProblem` in `src/store/learner.ts`).

## The design

### 1. Three outcomes for a line, not two (fixes A)

Add one status to `CheckedLine` (`src/engine/types.ts`): `'step'`.

| Status | Meaning | What the learner sees |
| --- | --- | --- |
| `ok` | True as it stands. | Green tick (as now). |
| `step` | Part of a valid rule has been applied and the rest is still to come. Nothing false has been claimed. | A neutral dot and one short line saying what is left ("Power raised. Next: divide by the new power."). No gap, no card, no "should read", no lost XP. |
| `wrong` | A rule was broken (wrong sign, the product differentiated term by term, the wrong direction), or a rule was left half-done **and never finished**. | The diagnosis card (as now). |

How the engine decides:

1. Keep `truth()` as the only judge of whether a line is true. Never let a model overrule it.
2. When a line is not true, classify the mismatch with the flaw families the engine already has
   (`integrateWith(e, v, flaw)` in `integrate.ts`, `diff(e, v, flaw)` in `expr.ts`, used today by `diagnose`).
   Tag each flaw as one of:
   - **unfinished**: the first move of a rule done and the second not yet (integral power rule without the
     division, derivative power rule with the power brought down and not lowered, the outside differentiated and
     the inside not yet multiplied in, one half of the product rule written, limits not yet put in, `+ C` not yet
     written on a line that is not the last);
   - **broken**: everything else (sign, direction, product or quotient done wrongly, a slipped number).
3. An **unfinished** line becomes `step` when a later line in the same attempt is true. It becomes `wrong`, with
   today's diagnosis, only if the attempt ends without that happening (it is the last line when "Done" is
   pressed, or every later line is also not true).
4. A **broken** line is `wrong` at once, as now.
5. An exponent or coefficient left unevaluated (`3x^(2+1)`, `(2+1)x^2`) is never a reason to mark anything: the
   parser already evaluates it, keep it that way.

In "Check as I go" mode a line is judged as it is entered, before the next one exists. Show an unfinished line as
`step` straight away with its "what is left" note, and re-judge the whole attempt whenever a line is added
(`calcAnalyze` already re-runs over all lines). If "Done" is pressed with it unresolved, it turns `wrong` then.

"This line should read" (`fix`) must be the **corrected form of that same line**, never the final answer: the
learner's line with the missing move applied. Once section 3 exists, take it from the detailed route: the first
step of the route that the learner's previous true line has not yet reached.

Verdict and marks:

- `verdict` stays as now: `solved` when the last line is true and final.
- `marks` contains `wrong` lines only. A `step` line is never a mark, never opens a review, never lowers the
  "clean" count or XP. Check `recordAttempt` (`src/store/learner.ts`) and `xpOf` (`src/store/game.ts`).

### 2. The AI reads intent, the engine stays the judge (fixes "understand each line")

Used only for a line the engine has found not true and cannot classify as unfinished or broken. Correct lines
stay instant and offline.

- Extend `aiDiagnose` (`src/ai/tasks.ts`, router task `diagnose`) to return
  `{ "kind": "step" | "error", "principle": string, "note": string, "completes_to": string }`.
- `completes_to` is the learner's line with the missing move applied, in the engine's plain notation. Accept
  `kind: "step"` **only if the engine finds `completes_to` true** with `truth()`. Otherwise treat the line as an
  error. This is what stops a model from approving wrong maths.
- `note` is written in the app's language, names the principle, and asks for the next move. It must not give
  the final answer and must not mention how many steps the learner used.
- Timeout 6 s. On timeout, refusal or no AI: fall back to rule 3 above (the line stays `step` while the attempt
  can still finish it, and becomes `wrong` at "Done").
- Put the same instruction in the system prompt of `aiSimplify` and `aiCheckOpen`: mark principles, never length.

### 3. Explanations in the smallest steps (fixes C)

Make the route a first-class result of the engine, then show all of it.

- `integrate()` returns a `trace: SolutionStep[]` alongside `F`. Each rule appends its own small steps:
  - **constant multiple**: `∫ 3x^2 dx = 3 ∫ x^2 dx`;
  - **sum**: split into one integral per term;
  - **power rule**: state the rule in general (`∫ x^n dx = x^(n+1)/(n+1) + C, n ≠ −1`), say what n is here, apply
    it, then tidy (`3 · x^3/3 = x^3`);
  - **table**: name the entry used;
  - **linear inside**: integrate the outside, divide by the coefficient of x, say why;
  - **substitution**: name u, write du, rewrite the integral in u, integrate, put the inside back;
  - **parts**: name u and dv, write du and v, state `∫u dv = uv − ∫v du`, substitute, do the integral that is
    left (its own steps, nested), collect;
  - **+ C**: one closing step saying why one constant is enough.
- Do the same for `derivativeSteps` (name the rule, the parts, each small derivative, then assemble and tidy),
  `definiteSteps` (antiderivative with its steps, value at the top, value at the bottom, subtract) and
  `limitSteps` (try the number, say what breaks, factor, cancel, substitute).
- Review `src/engine/steps.ts` (algebra) for the same grain: the operation done to both sides is its own step,
  then the tidied line.
- Every `why` is a whole sentence through `t()` with named values (see `docs/I18N.md`), with French and Russian
  entries. The general rule comes before its use, as in the learner's example.
- Where it is shown: "Show the whole solution" in `Session.tsx` (rename the heading from "Here's a clean route"
  to "Step by step"; drop "Clean route"), the hint ladder (`calcHint`: the next line is the next **small** step
  after the learner's last true line, not a jump to the answer), and "Explain it" on an example.
- Optional wording pass by the AI (new router task `explain`, ladder `['medium', 'hard']`): it may reword each
  `why` more warmly in the app's language and add a sentence, but it receives the engine's lines as fixed and
  must return them unchanged. If any returned line differs from the engine's, discard the AI text and show the
  engine's. Without AI the engine's own text is complete.

### 4. No remarks about length (fixes B)

- Remove the `long-way` mark from `analyze.ts`, and the `strategy` severity if nothing else uses it (then also
  its label "Route" and the `strategy` filters in `Session.tsx`, and its entry in `src/engine/types.ts`).
- Remove the "N× as many lines as the shortest route" and "You skip lines…" insights from `learner.ts`.
- Replace "Solved, with a detour" by "Solved". Keep "Solved, with the line shown" (that one is about a hint).
- `cleanSteps` may stay in the record for the learner model, but nothing on screen compares it with `steps`.
- Run `node scripts/i18n-check.mjs --unused` and delete the dictionary entries this orphans.

### 5. The written-answer screen (fixes D)

- Fewer written answers in the first place:
  - `buildCalcProblem`: read "the integral of X", "the integral of X from a to b", "the derivative of X",
    "differentiate X (with respect to t)", "the limit of X as x → a" as the matching engine problem.
  - `exampleProblem`: the question is the example's first sentence. Stop before "Let …", "Solution", "Using …",
    "By …" and before the first `=` that follows a complete expression, so the notes' own working is not part
    of the question.
- For what truly needs words, rebuild `OpenWork` on the parts `Workspace` already uses: the same numbered
  `MathField` line boxes and the same `Keyboard`. The phone's own keyboard must not open.
  - The letters layout needs a **space bar**, comma, full stop and question mark so a sentence can be typed.
    Give the bottom row a wide space key.
  - A line that the engine can read is drawn as maths; a line of words stays as text.
  - Checking stays as now: `aiCheckOpen` on "Check my answer", and "I've done this one" for self-marking. Update
    its prompt per section 2.

## Order of work

Each step is one commit, and the app must build and pass every check after each.

0. **Make the screens typecheck** (see "Working in this repository").
1. **Tests first, no behaviour change.** Add the cases under "Acceptance" as failing tests marked `todo`, and
   add tests that pin what must not change (list below).
2. **Section 3**: route traces and the detailed solution view. Nothing else depends on marking yet.
3. **Section 1**: the `step` status, the unfinished/broken tagging, `fix` from the route. Then the UI for `step`
   in `Mark`, `DiagnosisCard`, the summary and the Progress record.
4. **Section 4**: remove the length remarks.
5. **Section 2**: the AI second opinion (needs a router change, which redeploys by itself on push).
6. **Section 5**: wording patterns, example question cut, then `OpenWork`.

## Acceptance

Add these to `src/engine/__tests__/` and `src/store/__tests__/`.

Marking:

- `∫ 3x^2 dx` with `['3x^(2+1)', '3x^3/3', 'x^3 + C']` → verdict `solved`, statuses `['step', 'ok', 'ok']`, no marks.
- The same problem with only `['3x^(2+1)']` at "Done" → not solved, one gap mark "Divide by the new power.",
  and its `fix` is `3x^3/3` (or `x^3`), not `x^3 + C`.
- `['3 ∫ x^2 dx', '3 * x^3/3 + C', 'x^3 + C']` → all `ok` (unchanged).
- `['6x']` (differentiated instead of integrated) → `wrong` on that line at once.
- `d/dx(sin(x^2))` with `['cos(x^2)', 'cos(x^2) * 2x']` → `['step', 'ok']`, no marks; with `['cos(x^2)']` alone
  at "Done" → the chain-rule gap.
- `d/dx(x^2 sin(x))` with `['2x cos(x)']` → `wrong` at once (broken, not unfinished).
- A correct ten-line solution of `2(x + 3) = 14` → solved, no marks of any kind, no text about length.
- A `step` line does not change `xpOf`, the clean count, the concept state or the review queue.

Explanations:

- For every problem `practiceFor` can make (all concepts, 200 seeds): the route has at least two steps, every
  line of it passes `truth()`, and the last line is the answer `calcAnswer` gives. This property test is the
  guard against a wrong explanation ever shipping.
- `∫ 3x^2 dx` → at least: constant out, the rule in general, n = 2 applied, tidied, + C.
- `∫ x e^(2x) dx` → names u and dv, gives du and v, states the formula, does the remaining integral, collects.
- `∫_0^2 3x^2 dx` → antiderivative steps, value at 2, value at 0, subtraction.

Reading questions:

- "Evaluate the integral of 2x cos(x^2). Let u = x^2, du = 2x dx." → kind `integral`, given `∫ 2x cos(x^2) dx`.
- "Find the derivative of x^2 sin(x)." → kind `derivative`.
- "Show that the harmonic series diverges." → still a written answer.

On the phone (manual): the three screenshots in the report. The written-answer screen shows line boxes and the
maths keyboard; the flagged solution shows no gap; "Show the whole solution" for `∫ x e^(2x) dx` shows several
numbered steps.

## What must not change

Pin these with tests before touching the engine:

- Every existing test (141 at the time of writing) keeps passing. If one encodes the old two-outcome marking of
  a partial line, change that test deliberately and say so in the commit.
- A wrong final answer is still wrong. A missing `+ C` on the last line is still caught. A carried mistake is
  still `carried`, and getting back on track is still `recovered`.
- Lines that keep `∫`, `d/dx` or `lim` are judged exactly as now.
- Old attempts stored on the phone (status `ok`, `wrong`, `carried`, `recovered`, `unchecked`, `unreadable`)
  still load and draw. `step` is an addition, not a rename.
- The model never decides that maths is right. It can only be asked about a line the engine has already found
  not true, and its "this is a step" needs the engine to agree.

## Working in this repository

- Branch `native`. The phone app is `apps/mobile` (Expo); the screens named above are the shared web screens it
  carries, in `src/`. Pushing to `native` builds the APK and, when `backend/` changed, redeploys the AI router.
- Run before every commit, from the repository root:
  `npm test` · `npm run i18n` · `cd apps/mobile && npm run typecheck && node scripts/build-island.mjs`
- **Typechecking the screens.** `npx tsc --noEmit` at the root fails today, because the root package has no React
  type packages; the build itself (esbuild) does not typecheck, and the `apps/mobile` typecheck only sees the
  shared files the native tabs import. So a type error in `src/screens` can ship unnoticed. Step 0 of the work:
  add `@types/react` and `@types/react-dom` as root devDependencies in a commit of their own, get
  `npm run typecheck` clean, and add it to `.github/workflows/native.yml` next to the tests.
- Every line a person reads goes through `t()`, `tn()` or `msg()` and needs a French and a Russian entry, or the
  build fails. Add them by hand to `src/i18n/fr.more.ts` and `ru.more.ts`. (Their header says "generated"; the
  sheets they came from are not in the repository, so treat both files as hand-edited and correct the header.)
- No long dashes in the app's own text, in any language. No real photographs. No AI keys in the app.
- The free Gemini plan answers reliably only with the smallest model. Anything that calls the AI needs a
  timeout and a working fallback, and nothing on the correct-answer path may wait for it.
- The learner tests on a real Android phone. What cannot be checked there before handing over should be said so.
