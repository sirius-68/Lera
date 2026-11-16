# Lera: moving to native Android and iOS

> **Where this stands (branch `native`, `apps/mobile`):** the native app is complete in the sense of rule 1,
> nothing is lost. The tabs, navigation, Lera, widgets (Android), reminders and haptics are native. The
> lesson reader, practice, import, Ask Lera, notebook, settings, streak, onboarding and sign-in still run
> from the existing screens inside the app, and are moved to native one at a time. See `apps/mobile/README.md`.

A plan for rebuilding Lera as a native app for Android and iPhone without losing anything it does today.
Written for the agent doing the work (Claude Fable 5.2), and for Ekole to check progress against.

**Starting point:** branch `android-apk` of `sirius-68/Lera` (commit `03a9278` or later). That build is a React web app wrapped by Capacitor, tested as an Android APK. It stays the working app until the new one passes the checklist in section 7.

**Target:** React Native with Expo (new architecture, Hermes), one codebase that builds for Android and iOS.

---

## 1. Rules for the whole migration

1. **Nothing is lost.** Every item in the feature checklist (section 7) must work in the new app before the Capacitor app is retired.
2. **The 103 tests keep passing at every commit.** They cover the maths engine, the book reader and the learning logic. If one fails, stop and fix it before going on.
3. **Every phase ends with a build that installs on both phones.** No phase leaves the app broken.
4. **Do the work on a new branch, `native`.** Leave `android-apk` alone so it can still produce the old APK.
5. **Speed is a requirement, not a nice-to-have.** Measure against the targets in section 6 on a cheap Android phone, not only on a good one.
6. **No em dashes (—) in text the app shows.** Ekole asked for them removed.
7. **Compare with the old app side by side.** Before changing a screen, take a screenshot of the old one. The new one should match it unless Ekole has asked for a change.

---

## 2. What moves across unchanged

These folders are plain TypeScript with no screens. Move them into a shared package and keep them as they are.

| Folder | What it is | Notes |
|---|---|---|
| `src/engine/` | Maths parser, checker, diagnosis, calculus, hints, worked solutions, problem generator, LaTeX output | No browser code. Moves as is. |
| `src/ingest/structure.ts`, `toc.ts`, `layout2d.ts`, `text.ts`, `calc.ts`, `glossary.ts`, `types.ts`, `index.ts` | Turning a document into chapters, lessons, exercises and graphs; rebuilding stacked fractions from PDF positions | No browser code. Moves as is. |
| `src/ingest/pdf.ts` | Glyphs to lines to paragraphs | Pure logic once it has glyphs. The glyph extraction (pdf.js) is the part that needs a home, see section 4. |
| `src/ingest/docx.ts`, `xml.ts` | Word files | Uses `DOMParser`. Check it under Hermes; if missing, add a small XML parser (for example `@xmldom/xmldom`). |
| `src/store/learner.ts`, `game.ts`, `weakness.ts`, `types.ts` | Spaced review, streaks, XP, levels, badges, weak spots | No browser code. |
| `src/store/auth.ts` | Profiles, password hashing, reset by code | Swap `localStorage` for `expo-secure-store` and `crypto.subtle` for `expo-crypto` (PBKDF2). Keep the same rules and tests. |
| `src/store/index.ts` | The single store and all actions | Keep the actions. Replace the storage layer (section 4). |
| `src/ai/` | Build-time AI hooks | Keep. `fetch` works in React Native. |
| `src/ui/mathrow.ts` | The box-based maths input model (fractions, powers, integrals in boxes) | Pure logic. Moves as is. |
| `src/mascot/Lera.tsx` (the `LOOKS` table and the SVG paths) | Lera's drawing and her 50 moods as data | The data moves; the drawing and animation code is rebuilt (section 3). |

**Suggested layout:**

```
lera/
  packages/core/        engine, ingest logic, store logic, ai, mathrow, Lera's mood table
  apps/mobile/          the Expo app
  apps/web/             the current web app, kept building until retirement (optional)
```

Use npm or pnpm workspaces. The tests run from `packages/core`.

---

## 3. What gets rebuilt, and with what

| Part | Use | Notes |
|---|---|---|
| Navigation and screens | **Expo Router**, native stack | The routes are listed in section 7. The bottom tab bar has Home, Learn, Practice and Progress. Ask Lera and Review are sheets. |
| Animations and gestures | **react-native-reanimated** + **react-native-gesture-handler** | Run on the UI thread. Swipe to turn lesson pages lives here. |
| Keyboard | **react-native-keyboard-controller** | Typing fields must never sit behind the keyboard, on any screen. |
| Long lists | **@shopify/flash-list** | The learning path, notebook, chat history, Practice lists. |
| **Lesson reader** | **Expo DOM components** (`'use dom'`) wrapping the current `Lesson.tsx` reader, `SegText`, `MathBlock` and KaTeX | Keeps text selection, highlights, notes, glossary taps, formula captions and multi-row working exactly as they are. Pass the lesson in, send events (highlight added, note saved, Ask Lera) out to native. |
| **Formula display elsewhere** (practice, hints, solutions, notebook) | A shared DOM component for typeset maths, or KaTeX output rendered once and cached | Typeset once when a book is imported and save the result. Don't re-typeset on every render. |
| **Lera** | **react-native-svg** + Reanimated | Same paths, same `LOOKS` table (eyes, brows, mouth, hands, held and worn things, tints, effects). Re-code each CSS keyframe in `src/mascot/lera.css` as a Reanimated animation: breathing, blinking (irregular, sometimes double), eye tracking (finger, typing, scanning, darting), tap reactions (hop, cycling moods, dizzy after five taps), sleep with formulas floating up, and every mood's motion. Pause her animation when she is off screen. |
| Celebration scenes | Reanimated + react-native-svg | Session complete, streak, daily goal, level up, chapter complete, first catch in onboarding. Confetti included. |
| Onboarding motion scenes | Reanimated + react-native-svg | The scenes in `src/screens/onb/Scenes.tsx` and `Art.tsx`. |
| **Maths input** (practice keyboard) | Native views driven by `mathrow.ts` | Templates for fraction, power, root, absolute value, d/dx, integral, integral with limits, limit. Arrows move between boxes; tapping a box moves the cursor there; an empty box blocks checking. |
| Graphs | **react-native-svg** (or Skia) | Drag along the curve to read a point and its slope; zoom; show the derivative. Used in lessons and in the onboarding graph step. |
| Storage | **expo-sqlite** for documents and lessons; **react-native-mmkv** for the rest of the state | Load a lesson only when it is opened. Never keep a whole 400-page book in memory. |
| Secure data | **expo-secure-store** | The profile and password hash. |
| Haptics | **expo-haptics** | Same patterns as now. |
| Notifications | **expo-notifications** | One daily reminder at the chosen study time; Settings can change or turn it off. |
| File picking | **expo-document-picker** + **expo-file-system** | PDF, DOCX, TXT, Markdown. |
| Share and copy | **expo-sharing** / React Native `Share`, **expo-clipboard** | Chat bubbles, highlights, notebook. |
| Text menu | The DOM reader sets its own selection toolbar | The old Android-only `LeraWebView.java` override is no longer needed once the reader is a DOM component; check that the system Copy/Share menu does not appear over Lera's toolbar on either phone. |
| App icon | Generated by `scripts/widget-art.py` (`public/icon.svg`) | Use it for both platforms through `app.json`. |
| Builds | **EAS Build**, or GitHub Actions with an Ubuntu runner (Android) and a macOS runner (iOS) | Keep a workflow that produces an installable Android build on every push, like today. |

---

## 4. The hard parts

### Reading PDFs
pdf.js does not run directly under Hermes. Two ways, in order:

1. **First:** run pdf.js inside a hidden DOM component or WebView. It returns the glyphs (text, x, y, width, height, font) page by page to native code, and the existing `stackFractions`, `stripCancelMarks`, `buildLines`, `assemble` and `applyBookStructure` do the rest unchanged. Process in pages, report progress, and let the person keep using the app while a book is read.
2. **Later, only if speed needs it:** native glyph extraction (PDFKit on iOS, PdfiumAndroid or a similar library on Android) behind the same glyph interface.

Read a book once, save the finished lessons in SQLite, and never read the PDF again.

Test with: `fx/powers.pdf`, `fx/book-outline.pdf` (222 pages), `fx/fractions.pdf` (stacked fractions, symbol-font brackets, cancelling), and a real textbook from Ekole (the *Algebra II for Dummies* chapter he tested with).

### Lera
She is the part people notice most. Port her early (phase 4) and compare her side by side with the old app, mood by mood, until the timings feel the same. The full mood list is the `ALL_MOODS` export in `src/mascot/Lera.tsx`.

### Widgets
- **Android:** keep `android-overrides/StreakWidget.java`, `StreakWidgetWide.java`, `WidgetBridge.java`, the layouts and the drawables. Add them through an Expo config plugin. The web-view bridge `window.LeraNative` becomes a small native module (Expo Modules API) with the same calls: `setWidget`, `canPin`, `pinWidget`, `takeAction`.
- **iPhone:** a new WidgetKit extension in Swift, added with `@bacons/apple-targets`. The app writes the same numbers (streak, last day practised, goal, XP today, reviews due, this week) to an App Group, and the widget works out Lera's mood from the clock using the same ladder as Android:
  - practised today: pleased, or cool once the goal is reached;
  - streak alive, today not done: asleep before 6am, cheerful before noon, pleading before 5pm, alarmed before 9pm, desperate after;
  - one day missed: sad; three days: bored; a week: cobwebs; a month: a ghost; a year: a fossil;
  - never practised: waiting.

  iOS decides how often widgets refresh, so use a timeline with entries at those hour boundaries. Tapping the widget opens Practice. Lera reacting to a tap needs iOS 17 interactive widgets; below that, a tap just opens the app.
- Widget pictures come from `scripts/widget-art.py`. Extend it to write iOS assets (PDF or PNG at @2x/@3x) alongside the Android vector drawables.

### Sign-in
Keep the rules in `src/store/auth.ts` and its tests: email and password, at least 8 characters with a number, one profile per phone, reset by email then a 6-digit code then a new password. There is still no email service: the code is shown on screen with a note saying so. When a backend exists, `LERA_AUTH_URL` switches the same screens to it.

---

## 5. Phases

Each phase ends with an installable build on both phones and the tests passing.

### Phase 0: inventory (before writing any code)
- Copy the feature checklist (section 7) into a tracking issue or file.
- Take a screenshot of every screen and state of the current app (the Playwright scripts used so far did this; keep them).
- Note anything in the checklist that is unclear and ask Ekole.

### Phase 1: foundations
- Create the workspace layout from section 2 and move the shared logic into `packages/core`.
- Make the 103 tests run from there.
- Create the Expo app with Expo Router, Reanimated, gesture handler, keyboard controller, MMKV, SQLite, secure store.
- Wire the store to MMKV and SQLite; check that state survives closing the app.
- Set up EAS (or GitHub Actions) to produce an Android build and an iOS build.

### Phase 2: the simple native screens
- Splash and welcome (white, rings and formulas in purple).
- Onboarding: every step in `src/screens/Onboarding.tsx` (questions in a speech bubble, drawn and animated answer tiles, the try-it step, the interactive graph, the plan, notifications, add-widget, upload, the final celebration).
- Sign-in: create profile, sign in, reset by code, sign out, the lock screen after signing out.
- Home, Settings, Streak (floating header that content scrolls under), Progress.

### Phase 3: lessons and import
- Upload and processing screen, with progress.
- PDF and Word import through the approach in section 4.
- The learning path with collapsible chapters.
- The lesson reader as a DOM component: pages by sub-topic, swipe left and right with the sliding transition, controls fixed at the bottom, highlights, notes, glossary, graphs, formulas with captions, multi-row working.
- Chapter-complete celebration; a new book opens at chapter one, lesson one.

### Phase 4: Lera
- Port the drawing and all 50 moods, sleep, eye tracking and tap reactions.
- Put her into every screen that has her.

### Phase 5: practice
- Session: brief, the workspace, the box keyboard, check as you go or at the end, hints in three steps, show solution, Done, answer-only rule, diagnosis cards with "Did that make sense?", plain-words re-explanation, review links.
- Summary and celebration scenes.
- Practice page with three tabs (Review, My lessons, Any topic).
- Review sheet.

### Phase 6: Ask Lera and the notebook
- Chat sessions with history, new chat, delete; bubble tools (copy, save, share, ask again, delete); answers that work offline from the notes and with AI when configured.
- Notebook: saved items, notes, highlights, search, filters, open the source.

### Phase 7: widgets and notifications
- Android widgets through the config plugin and native module.
- iPhone widget.
- Daily reminder on both.

### Phase 8: parity check and release
- Go through the checklist on a cheap Android phone and an iPhone.
- Measure the speed targets.
- Fix what fails, then retire the Capacitor app.

---

## 6. Speed targets

Measure on a low-end Android phone (2 GB to 3 GB of RAM) and an iPhone.

| What | Target |
|---|---|
| Cold start to the home screen | under 2 seconds |
| Scrolling the path, notebook and chat lists | no dropped frames that you can see |
| Opening a lesson page | feels instant (under 300 ms) |
| Turning a lesson page by swiping | follows the finger, no lag |
| Reading a 222-page book (`fx/book-outline.pdf`) | under 30 seconds, app usable meanwhile |
| Reading a 400-page book | under a minute, app usable meanwhile |
| Lera idle on screen | does not drain the battery noticeably; paused when off screen |
| App download size | as small as practical; note it in the release |

---

## 7. Feature checklist

Every line must work in the new app. Tick it only after trying it on both phones.

### Start
- [ ] Splash screen: Lera with purple rings and formulas on white
- [ ] Welcome: Lera cycling through moods; Get started; I already have a profile
- [ ] Sign in from the welcome screen

### Onboarding
- [ ] Three-part progress bar and back button
- [ ] "I read every line" scene (animated)
- [ ] Subjects: Algebra, Calculus 1, Calculus 2 (multi-select)
- [ ] Where you study (animated tiles)
- [ ] What brings you here
- [ ] "Your notes become your path" scene
- [ ] Try-it step: tap the wrong line, then the "You found it!" celebration
- [ ] How maths feels (Lera's face changes with the answer)
- [ ] What trips you up (up to three)
- [ ] "Ideas come back" scene
- [ ] Check as you go or at the end
- [ ] "Plain words" scene
- [ ] Daily goal with the weekly projection bars
- [ ] Interactive graph (calculus only)
- [ ] When you study (animated tiles)
- [ ] "Showing up counts" scene
- [ ] Name
- [ ] Create a profile (or continue without)
- [ ] Plan built line by line, Lera in front of the card
- [ ] Allow notifications (real permission prompt and daily reminder)
- [ ] Add widget (Android; iPhone shows how)
- [ ] Upload notes or skip
- [ ] Final celebration and Start learning
- [ ] "Skip the tour" keeps the questions and drops the scenes

### Profiles
- [ ] Create a profile (email, password rules shown)
- [ ] Sign in; wrong password message
- [ ] Reset: email, then 6-digit code, then new password; old password works until the code is confirmed
- [ ] Sign out locks the app; nothing shows until signed in again
- [ ] Create a profile later from Settings
- [ ] Lera reacts to the form (reading, covering her eyes for the password, peeking when shown, thumbs-up when done)

### Home
- [ ] Greeting and name, streak pill, settings
- [ ] Lera's mood and line follow the day (cool when goal reached, sad when the streak ends tonight, determined when reviews are due, fired on a streak)
- [ ] Lera falls asleep when left alone and dreams in formulas; tap wakes her
- [ ] Today's goal ring and week strip
- [ ] Main button: review, continue, or upload
- [ ] Fix this first card linking to the weak lesson
- [ ] Continue card (Practise hidden when the lesson has no exercises)
- [ ] Tiles: streak, notebook, Ask Lera (saved chats count), Add notes

### Learn
- [ ] Book switcher and progress
- [ ] Chapters collapsible on big books; ring and arrow centred
- [ ] Path of lessons with status (read, gap, solid, current)
- [ ] Note about where the chapters came from (outline or contents page)

### Upload and books
- [ ] PDF, DOCX, TXT, Markdown
- [ ] Sample algebra notes
- [ ] Processing screen with progress; long-book hint
- [ ] Chapters and sections from the file outline, the printed contents page, numbering, or type size
- [ ] Cover, copyright, contents, preface and index pages left out
- [ ] Powers read correctly (raised glyphs)
- [ ] Stacked fractions rebuilt; symbol-font brackets and dots restored; cancelling rows left out
- [ ] Formulas keep their printed names; working over several rows kept as rows
- [ ] Calculus exercises found; graphs rebuilt from functions in the text
- [ ] Glossary terms found
- [ ] A new book opens at chapter one, lesson one
- [ ] Books up to 400 pages without running out of memory

### Lesson
- [ ] Lesson / Practice tabs (Practice hidden when there are no exercises)
- [ ] Pages by sub-topic with the segmented pager
- [ ] Swipe left and right to turn pages, with the sliding transition; graphs and wide formulas don't trigger it
- [ ] Controls fixed at the bottom: back, Continue n/N, Practise, Next lesson, Finish
- [ ] Ask Lera button above the controls
- [ ] Select text: highlight in colours, underline, note, copy, share, explain, ask Lera
- [ ] Formulas select as one piece
- [ ] Glossary terms tappable with definitions
- [ ] Notes shown in place; tap to read
- [ ] Graphs: drag, zoom, slope, derivative; "Graph it" on formulas
- [ ] Worked examples step by step ("Next line")
- [ ] Formulas typeset as the book wrote them, with captions and aligned rows
- [ ] Chapter-complete celebration
- [ ] Last page remembered per lesson

### Practice
- [ ] Three tabs: Review (due and coming back), My lessons, Any topic
- [ ] Speech-bubble message from Lera
- [ ] Check as you go / at the end switch
- [ ] Session brief (problems, minutes, from notes, coming back)
- [ ] Box keyboard: fraction, power, x², root, absolute value, d/dx, integral, integral with limits, limit, e to the power, sin, cos, tan, ln, π, ∞, no limit, or, no solution, all reals, comma
- [ ] Arrows move between boxes; tap to place the cursor; empty box blocks checking
- [ ] Backspace on an empty line pulls the previous line back
- [ ] Each line checked as you go (or all at the end); carried and recovered lines
- [ ] Diagnosis card: what went wrong, the rule, "Did that make sense?", plain-words version, review link, corrected line
- [ ] Hints in three steps
- [ ] Show solution; skip
- [ ] Done button
- [ ] Answer only: accepted, then working asked for once
- [ ] Word problems with written answers (AI when configured)
- [ ] Lera's mood follows the work (calculating, shocked at a gap, eureka on recovery, thumbs-up)
- [ ] Summary: XP, solved, clean, minutes, what I noticed, weak spots, Review it now and Done (spaced apart)
- [ ] Celebration scenes: complete, streak, goal, level up
- [ ] Review sheet for one idea

### Ask Lera
- [ ] Saved chat sessions; history list with title, lesson, count, time, preview
- [ ] New chat; delete chat
- [ ] From a lesson: continues that lesson's latest chat
- [ ] Quick questions
- [ ] Bubble tools: copy, save to notebook, share, ask again, delete
- [ ] Works offline from the notes; uses AI when configured

### Notebook
- [ ] Header with counts that filter (saved, notes, highlights)
- [ ] Search
- [ ] Cards open the lesson (or the chat)
- [ ] Pin, copy, delete

### Streak and progress
- [ ] Floating streak header that shrinks; content scrolls under it
- [ ] Today's goal, level and XP bar, longest streak, days practised, next milestone
- [ ] Last five weeks calendar
- [ ] Badges
- [ ] Widget previews (the big one cycles through states) and Add small / Add wide
- [ ] Progress page: weak spots linked to lessons, history

### Settings
- [ ] Name, subjects, check mode, daily goal
- [ ] Reminders: off or a time of day
- [ ] Profile: signed in as, sign out, or create a profile
- [ ] Export progress; erase everything

### Widgets
- [ ] Android small and wide widgets; iPhone widget
- [ ] Mood, background and line follow the ladder in section 4
- [ ] Some states fill the card with Lera's face
- [ ] Tap the card: opens Practice
- [ ] Tap Lera: she reacts for a few seconds (Android; iPhone on iOS 17+)
- [ ] Wide widget shows this week's days

### Everywhere
- [ ] Back buttons on a soft round background
- [ ] No em dashes in the app's own text
- [ ] Hardware back (Android) and swipe back (iPhone) follow the screen stack; a session asks before leaving
- [ ] Keyboard never covers a typing field
- [ ] No system text menu over Lera's selection toolbar
- [ ] App icon: Lera's face
- [ ] Reduced motion setting respected

---

## 8. What Ekole needs to provide

- An **Apple Developer account** ($99 a year) for iPhone builds, TestFlight and the App Store.
- An **iPhone** to test on (or TestFlight on one).
- A **real textbook PDF** for import testing.
- Later: an **email service or backend** so reset codes are actually emailed, and the AI settings (`LERA_AI_BASE_URL`, `LERA_AI_MODEL`, `LERA_AI_KEY`) as build secrets.

---

## 9. Not in scope for the migration

Keep these out until the new app matches the old one:

- new features;
- redesigns Ekole hasn't asked for;
- switching the mascot to Rive or another animation tool (Lera is kept as she is).
