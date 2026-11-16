// Lera's AI router as a Supabase Edge Function. All the logic is in ../_shared/router.ts.
//   supabase secrets set ANTHROPIC_API_KEY=...
//   supabase functions deploy lera-ai --no-verify-jwt
import { Env, handle } from '../_shared/router.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(fn: (req: Request) => Response | Promise<Response>): void };

const KEYS: (keyof Env)[] = ['ANTHROPIC_API_KEY', 'LERA_MODEL_EASY', 'LERA_MODEL_MEDIUM', 'LERA_MODEL_HARD', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'LERA_ALLOWED_ORIGINS'];
const env: Env = Object.fromEntries(KEYS.map((k) => [k, Deno.env.get(k)]));

/** Calls a phone may make in a day. Set LERA_DAILY_LIMIT=0 to switch the limit off. */
const LIMIT = Number(Deno.env.get('LERA_DAILY_LIMIT') ?? '200');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

/**
 * One counter per phone per day, kept in the lera_ai_usage table (see ../../migrations).
 * The phone sends a random id it made itself, so this stops runaway use, not a determined person.
 * If the database cannot be reached, the call is let through rather than blocking students.
 */
async function allow(device: string): Promise<boolean> {
  if (!LIMIT || !SUPABASE_URL || !SERVICE_KEY) return true;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/lera_ai_bump`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ p_device: device || 'unknown' }),
    });
    if (!res.ok) return true;
    return Number(await res.json()) <= LIMIT;
  } catch {
    return true;
  }
}

Deno.serve((req) => handle(req, env, { allow }));
