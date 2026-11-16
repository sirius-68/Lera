# Lera's AI router

One address for the app, three models behind it. The app names the job ("chat", "translate"…); the router
picks the cheapest model that does that job well, checks the answer, and asks the next model up if the
check fails or the model is busy. The AI keys live here and never in the app.

| Job | Starts at | Moves up to | Checked by |
|---|---|---|---|
| `diagnose`: putting a mistake the engine found into words | easy | medium | reply is JSON with a title |
| `simplify`: "that didn't make sense", said more simply | easy | medium | |
| `chat`: Ask Lera | medium | hard | |
| `translate`: a book into the app's language | medium | hard | same number of paragraphs back |
| `structure`: a book into chapters, lessons, exercises | hard | | reply is JSON with units |
| `checkOpen`: marking a word problem the engine can't check | hard | | reply is JSON with a verdict |

The app can also say a request already looks hard (`lera.level`), and the router then starts one model
higher. Ask Lera does this after a student has asked three questions in one chat.

Lera's own engine decides whether maths is right. That is why most jobs only need the small model: it
is asked to word things, not to judge them.

All of this is in `supabase/functions/_shared/router.ts` (the table is `TASKS`), with tests next to it.

## Setting it up, from your phone

The workflow `.github/workflows/ai-router.yml` deploys the router and hands it your AI key. You only add
repository secrets (GitHub: the repository's Settings, Secrets and variables, Actions):

| Secret | Where to get it |
|---|---|
| `GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY` | Google AI Studio / the Claude Console |
| `SUPABASE_ACCESS_TOKEN` | supabase.com, your account menu, Access Tokens, generate one |
| `SUPABASE_PROJECT_REF` | the id in your Supabase project's address, `https://<this>.supabase.co` (a new free project is fine) |
| `SUPABASE_DB_PASSWORD` (optional) | the project's database password; with it, the per-phone daily limit is switched on |

Then run "Deploy the AI router" from the Actions tab (or push anything under `backend/`). It tests the
router, stores the keys on Supabase, deploys, and asks it one question to prove it answers. The app
builds work out the router's address from `SUPABASE_PROJECT_REF` by themselves, so the next APK uses it.

With only a Gemini key, the tiers are Gemini's Flash-Lite, Flash and Pro. With a Claude key they are
Haiku, Sonnet and Opus. With both, Claude is used unless you set the tiers yourself (below), for example
`LERA_MODEL_EASY=gemini/gemini-flash-lite-latest` with Claude for the rest. If the strongest model isn't
on your plan, the next one down answers instead.

By hand instead, with the Supabase CLI, from this folder:

```bash
supabase link --project-ref <ref>
supabase db push
supabase secrets set GEMINI_API_KEY=<key>
supabase functions deploy lera-ai --no-verify-jwt
```

## Settings you can change

Set any of these with `supabase secrets set NAME=value`:

| Name | What it does | Default |
|---|---|---|
| `LERA_MODEL_EASY` | The small model | `anthropic/claude-haiku-5-5`, or `gemini/gemini-flash-lite-latest` with only a Gemini key |
| `LERA_MODEL_MEDIUM` | The middle model | `anthropic/claude-sonnet-5-5`, or `gemini/gemini-flash-latest` |
| `LERA_MODEL_HARD` | The strongest model | `anthropic/claude-opus-5-5`, or `gemini/gemini-pro-latest` |
| `OPENAI_BASE_URL`, `OPENAI_API_KEY` | Another company's OpenAI-compatible service. Then a tier can be `openai/<their model name>` | not set |
| `LERA_DAILY_LIMIT` | AI calls one phone may make in a day; `0` switches it off | `200` |
| `LERA_ALLOWED_ORIGINS` | Web addresses allowed to call it from a browser, comma separated. The phone apps don't need this | none |

Models change; when a newer one comes out, change the secret. Nothing in the app needs rebuilding.

## Limits, honestly

- Gemini's free plan: Google may use what is sent to improve its products, and the limits are low. For
  release, link a billing account to the Google project; paid use is not used that way.

- The daily limit counts a random id each phone makes for itself. It stops runaway use and casual abuse,
  not someone determined to get around it. Before a big public launch, tie it to signed-in accounts.
- Each job has a ceiling on reply length, and unknown jobs are refused, so the router can't be used as a
  free general chatbot.
- Provider error details stay in the Supabase function log; the app only gets a plain sentence.

## Trying it on your own computer

Put `ANTHROPIC_API_KEY=...` in a `.env` file at the repository root, then run
`LERA_AI_URL=/api/ai npm run preview`. The preview server runs the same router at `/api/ai`.
