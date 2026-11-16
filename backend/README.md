# Lera's AI router

One address for the app, three models behind it. The app names the job ("chat", "translate"…); the router
picks the cheapest model that does that job well, checks the answer, and asks the next model up if the
check fails or the model is busy. The AI keys live here and never in the app.

| Job | Starts at | Moves up to | Checked by |
|---|---|---|---|
| `diagnose`: putting a mistake the engine found into words | easy (Haiku) | medium | reply is JSON with a title |
| `simplify`: "that didn't make sense", said more simply | easy | medium | |
| `chat`: Ask Lera | medium (Sonnet) | hard | |
| `translate`: a book into the app's language | medium | hard | same number of paragraphs back |
| `structure`: a book into chapters, lessons, exercises | hard (Opus) | | reply is JSON with units |
| `checkOpen`: marking a word problem the engine can't check | hard | | reply is JSON with a verdict |

The app can also say a request already looks hard (`lera.level`), and the router then starts one model
higher. Ask Lera does this after a student has asked three questions in one chat.

Lera's own engine decides whether maths is right. That is why most jobs only need the small model: it
is asked to word things, not to judge them.

All of this is in `supabase/functions/_shared/router.ts` (the table is `TASKS`), with tests next to it.

## Setting it up (Supabase, about 15 minutes)

1. **A Claude key.** Sign in at the Claude Console, add billing, and create an API key.
2. **A Supabase project.** Use a new free project, or an existing one.
3. **Install the Supabase CLI** on your computer, then from this `backend/` folder:

   ```bash
   supabase login
   supabase link --project-ref <your project ref>
   supabase db push                                   # creates the daily-limit table
   supabase secrets set ANTHROPIC_API_KEY=<your key>
   supabase functions deploy lera-ai --no-verify-jwt
   ```

4. **Tell the app where it is.** In GitHub: the repository's Settings, Secrets and variables, Actions,
   new secret `LERA_AI_URL` with the value `https://<your project ref>.supabase.co/functions/v1/lera-ai`.
   The next build uses it.

## Settings you can change

Set any of these with `supabase secrets set NAME=value`:

| Name | What it does | Default |
|---|---|---|
| `LERA_MODEL_EASY` | The small model | `anthropic/claude-haiku-5-5` |
| `LERA_MODEL_MEDIUM` | The middle model | `anthropic/claude-sonnet-5-5` |
| `LERA_MODEL_HARD` | The strongest model | `anthropic/claude-opus-5-5` |
| `OPENAI_BASE_URL`, `OPENAI_API_KEY` | Another company's OpenAI-compatible service. Then a tier can be `openai/<their model name>` | not set |
| `LERA_DAILY_LIMIT` | AI calls one phone may make in a day; `0` switches it off | `200` |
| `LERA_ALLOWED_ORIGINS` | Web addresses allowed to call it from a browser, comma separated. The phone apps don't need this | none |

Models change; when a newer one comes out, change the secret. Nothing in the app needs rebuilding.

## Limits, honestly

- The daily limit counts a random id each phone makes for itself. It stops runaway use and casual abuse,
  not someone determined to get around it. Before a big public launch, tie it to signed-in accounts.
- Each job has a ceiling on reply length, and unknown jobs are refused, so the router can't be used as a
  free general chatbot.
- Provider error details stay in the Supabase function log; the app only gets a plain sentence.

## Trying it on your own computer

Put `ANTHROPIC_API_KEY=...` in a `.env` file at the repository root, then run
`LERA_AI_URL=/api/ai npm run preview`. The preview server runs the same router at `/api/ai`.
