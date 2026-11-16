/**
 * Lera's AI router: one address for the app, several models behind it.
 *
 * The app says which job it wants done ("chat", "translate", ...). The router picks the cheapest model that
 * does that job well, checks the answer, and if the check fails, or the model is busy, asks the next model up.
 * The provider keys live here, never in the app.
 *
 * Written with web-standard Request/Response and fetch only, so the same file runs as a Supabase Edge
 * Function (Deno), a Cloudflare Worker, or under Node for tests and local development.
 */

export type Tier = 'easy' | 'medium' | 'hard';

export interface Task {
  /** The models to try, in order. The first is the usual one; the rest are where it goes when an answer fails its check. */
  ladder: Tier[];
  /** The most a reply may be, whatever the app asks for. Stops the router being used as a free general chatbot. */
  maxTokens: number;
  /** A reply that fails this is not passed on; the next model is asked instead. */
  check?: (reply: string, req: ChatRequest) => boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
  /** What the app adds: which job this is, and how hard it already looks (0 = as usual, 1 or 2 = start that many models higher). */
  lera?: { task?: string; level?: number };
}

/** Pull the first JSON value out of a reply, even when it comes wrapped in prose or a code fence. */
export function firstJson(reply: string): unknown {
  const s = reply.replace(/```(?:json)?/gi, '');
  const start = s.search(/[[{]/);
  if (start < 0) return undefined;
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) {
      try {
        return JSON.parse(s.slice(start, i + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const lastUser = (r: ChatRequest): string => [...r.messages].reverse().find((m) => m.role === 'user')?.content ?? '';

/**
 * Every job the app has, and who does it. Lera's own engine decides whether maths is right, so most jobs only
 * need good wording and go to the small model. Only work that needs real reasoning starts at the top.
 */
export const TASKS: Record<string, Task> = {
  // turning a book into chapters, lessons, examples and exercises: long, messy, and it has to be right
  structure: { ladder: ['hard'], maxTokens: 8000, check: (r) => isObject(firstJson(r)) && Array.isArray((firstJson(r) as { units?: unknown }).units) },
  // a whole book into the app's language: careful, but not deep reasoning
  translate: {
    ladder: ['medium', 'hard'],
    maxTokens: 4000,
    check: (r, req) => {
      const out = firstJson(r);
      const sent = firstJson(lastUser(req));
      return Array.isArray(out) && Array.isArray(sent) && out.length === sent.length && out.every((x) => typeof x === 'string');
    },
  },
  // Ask Lera: a conversation about maths, it has to be right and kind
  chat: { ladder: ['medium', 'hard'], maxTokens: 600 },
  // a word problem the engine cannot check: the model's judgement is the check, so the best one does it
  checkOpen: { ladder: ['hard'], maxTokens: 400, check: (r) => isObject(firstJson(r)) && typeof (firstJson(r) as { correct?: unknown }).correct === 'boolean' },
  // putting a mistake the engine already found into words
  diagnose: { ladder: ['easy', 'medium'], maxTokens: 300, check: (r) => isObject(firstJson(r)) && typeof (firstJson(r) as { title?: unknown }).title === 'string' },
  // "That didn't make sense": the same point, more simply
  simplify: { ladder: ['easy', 'medium'], maxTokens: 350 },
};

export interface Env {
  /** The Claude key, from the Claude Console. */
  ANTHROPIC_API_KEY?: string;
  /** The Gemini key, from Google AI Studio. */
  GEMINI_API_KEY?: string;
  /**
   * Which model is each tier: "anthropic/<model>", "gemini/<model>", or "openai/<model>" for any
   * OpenAI-compatible service set below. Tiers can be different companies' models.
   */
  LERA_MODEL_EASY?: string;
  LERA_MODEL_MEDIUM?: string;
  LERA_MODEL_HARD?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  /** More web addresses allowed to call the router from a browser (a web version of Lera). The apps are always allowed. */
  LERA_ALLOWED_ORIGINS?: string;
}

/** The models used when no tier is set, for whichever key the server has (Claude first if both). */
const DEFAULT_MODELS: Record<'anthropic' | 'gemini', Record<Tier, string>> = {
  anthropic: { easy: 'anthropic/claude-haiku-5-5', medium: 'anthropic/claude-sonnet-5-5', hard: 'anthropic/claude-opus-5-5' },
  // the "-latest" names follow Google's newest model of each size, so this does not go stale
  gemini: { easy: 'gemini/gemini-flash-lite-latest', medium: 'gemini/gemini-flash-latest', hard: 'gemini/gemini-pro-latest' },
};

export const modelFor = (tier: Tier, env: Env): string =>
  (tier === 'easy' ? env.LERA_MODEL_EASY : tier === 'medium' ? env.LERA_MODEL_MEDIUM : env.LERA_MODEL_HARD) ||
  DEFAULT_MODELS[env.ANTHROPIC_API_KEY || !env.GEMINI_API_KEY ? 'anthropic' : 'gemini'][tier];

/** The models to try for a request, cheapest first, starting higher when the app says it is already hard. */
export function plan(task: Task, level = 0): Tier[] {
  const order: Tier[] = ['easy', 'medium', 'hard'];
  const lift = Math.max(0, Math.min(2, Math.floor(level)));
  const lifted = task.ladder.map((t) => order[Math.min(2, order.indexOf(t) + lift)]);
  return lifted.filter((t, i) => lifted.indexOf(t) === i);
}

class Upstream extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Errors worth trying another model for: busy, overloaded, rate-limited, down, or a model this key may not
 * use (a free plan often leaves out the biggest model). A badly formed request is not one of them.
 */
const retryable = (status: number): boolean => status === 403 || status === 404 || status === 408 || status === 429 || status === 529 || status >= 500;

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

async function callModel(model: string, req: ChatRequest, maxTokens: number, env: Env, fetcher: typeof fetch): Promise<string> {
  const [provider, ...rest] = model.split('/');
  const name = rest.join('/');
  const temperature = typeof req.temperature === 'number' ? Math.max(0, Math.min(1, req.temperature)) : undefined;

  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new Upstream('ANTHROPIC_API_KEY is not set on the server.', 500);
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const messages = req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
    const res = await fetcher('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: name, max_tokens: maxTokens, ...(system ? { system } : {}), messages, ...(temperature !== undefined ? { temperature } : {}) }),
    });
    if (!res.ok) throw new Upstream(`${model}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`, res.status);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  }

  if (provider === 'openai' || provider === 'gemini') {
    const url = provider === 'gemini' ? GEMINI_URL : env.OPENAI_BASE_URL;
    const key = provider === 'gemini' ? env.GEMINI_API_KEY : env.OPENAI_API_KEY;
    if (!url) throw new Upstream('OPENAI_BASE_URL is not set on the server.', 500);
    if (provider === 'gemini' && !key) throw new Upstream('GEMINI_API_KEY is not set on the server.', 500);
    const res = await fetcher(`${url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model: name, messages: req.messages, max_tokens: maxTokens, ...(temperature !== undefined ? { temperature } : {}) }),
    });
    if (!res.ok) throw new Upstream(`${model}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`, res.status);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? '';
  }

  throw new Upstream(`Unknown provider in "${model}". Use anthropic/<model>, gemini/<model> or openai/<model>.`, 500);
}

export interface Answer {
  reply: string;
  /** Which model's answer was used, and how many were tried before it. Logged, and sent back for testing. */
  model: string;
  tried: string[];
}

/** Run one request up the ladder until an answer passes its check. */
export async function route(req: ChatRequest, env: Env, fetcher: typeof fetch = fetch): Promise<Answer> {
  const name = req.lera?.task ?? '';
  const task = TASKS[name];
  if (!task) throw new Upstream(`Unknown task "${name}".`, 400);
  if (!Array.isArray(req.messages) || req.messages.length === 0 || req.messages.length > 40) throw new Upstream('messages must be a list of 1 to 40 messages.', 400);
  const size = req.messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 1e9), 0);
  if (size > 200_000) throw new Upstream('The request is too long.', 413);
  const maxTokens = Math.min(task.maxTokens, req.max_tokens && req.max_tokens > 0 ? req.max_tokens : task.maxTokens);

  const tried: string[] = [];
  let lastReply: string | null = null;
  let lastError: Upstream | null = null;
  const ladder = plan(task, req.lera?.level);
  // if every model on the ladder is unavailable (not merely wrong), the others are asked too, strongest first,
  // so a job still gets an answer when, say, a free plan does not include the biggest model
  const spare: Tier[] = (['hard', 'medium', 'easy'] as Tier[]).filter((t) => !ladder.includes(t));
  for (const tier of [...ladder, ...spare]) {
    if (!ladder.includes(tier) && lastReply !== null) break;
    const model = modelFor(tier, env);
    if (tried.includes(model)) continue;
    tried.push(model);
    try {
      const reply = await callModel(model, req, maxTokens, env, fetcher);
      lastReply = reply;
      if (reply.trim() && (!task.check || task.check(reply, req))) return { reply, model, tried };
    } catch (e) {
      lastError = e instanceof Upstream ? e : new Upstream(String(e), 502);
      // a request the provider calls wrong would be wrong everywhere: stop there
      if (!retryable(lastError.status)) throw lastError;
    }
  }
  // every model was asked: the last real answer is better than nothing, and the app checks it again itself
  if (lastReply !== null && lastReply.trim()) return { reply: lastReply, model: tried[tried.length - 1], tried };
  throw lastError ?? new Upstream('No model gave an answer.', 502);
}

/**
 * Where Lera's own screens run, so their calls are always let through: the native app's web view
 * (apps/mobile/host/Island.tsx) and the older Capacitor app on Android and iPhone.
 */
const APP_ORIGINS = ['https://lera.app.local', 'https://localhost', 'capacitor://localhost'];

/** The whole HTTP side: takes the app's request (OpenAI chat format plus `lera`), answers in the same format. */
export async function handle(request: Request, env: Env, opts: { fetcher?: typeof fetch; allow?: (device: string) => Promise<boolean> } = {}): Promise<Response> {
  const origin = request.headers.get('origin');
  const allowed = [...APP_ORIGINS, ...(env.LERA_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)];
  const cors: Record<string, string> =
    origin && (allowed.includes('*') || allowed.includes(origin))
      ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type, x-lera-device, authorization, apikey', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' }
      : {};
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: { message: 'Use POST.' } });

  const device = (request.headers.get('x-lera-device') ?? '').slice(0, 64);
  if (opts.allow && !(await opts.allow(device))) return json(429, { error: { message: 'Today’s limit for Lera’s AI has been reached on this phone. It comes back tomorrow.' } });

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return json(400, { error: { message: 'The body is not JSON.' } });
  }
  try {
    const answer = await route(body, env, opts.fetcher);
    return json(200, { model: answer.model, tried: answer.tried, choices: [{ index: 0, message: { role: 'assistant', content: answer.reply }, finish_reason: 'stop' }] });
  } catch (e) {
    const status = e instanceof Upstream ? e.status : 500;
    // provider details stay in the server log; the app gets a plain message
    console.error('lera-ai', body?.lera?.task, e instanceof Error ? e.message : e);
    return json(status >= 500 ? 502 : status, { error: { message: status === 400 || status === 413 ? (e as Error).message : 'The AI service is having trouble.' } });
  }
}
