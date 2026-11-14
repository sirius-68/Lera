import { AiConfig } from './providers';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function headers(c: AiConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (c.apiKey.trim()) h.Authorization = `Bearer ${c.apiKey.trim()}`;
  return h;
}

const base = (c: AiConfig): string => c.baseUrl.replace(/\/+$/, '');

function friendly(status: number, body: string): string {
  if (status === 401 || status === 403) return 'The AI key was rejected. Check it in Settings.';
  if (status === 404) return 'That model name wasn’t found. Load the model list in Settings and pick one.';
  if (status === 429) return 'The free limit for this AI key has been reached for now. Lera will carry on without it.';
  if (status >= 500) return 'The AI service is having trouble. Lera will carry on without it.';
  const detail = body.slice(0, 160).replace(/\s+/g, ' ');
  return `The AI service refused the request (${status}). ${detail}`;
}

/** One chat completion. Returns the reply text. */
export async function chat(
  config: AiConfig,
  messages: ChatMessage[],
  opts: { json?: boolean; temperature?: number; maxTokens?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const send = async (withJsonMode: boolean): Promise<Response> => {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: opts.temperature ?? 0.2,
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (withJsonMode) body.response_format = { type: 'json_object' };
    return fetch(`${base(config)}/chat/completions`, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  };

  let res: Response;
  try {
    res = await send(!!opts.json);
    // some models reject JSON mode; the prompt asks for JSON anyway, so retry without the flag
    if (res.status === 400 && opts.json) res = await send(false);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new AiError('Couldn’t reach the AI service. Check the connection, or the address in Settings.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AiError(friendly(res.status, text), res.status);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'object' && part && 'text' in part ? String((part as { text: unknown }).text) : '')).join('');
  }
  throw new AiError('The AI service replied with nothing usable.');
}

/** Models the key can use, straight from the provider. */
export async function listModels(config: AiConfig): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${base(config)}/models`, { headers: headers(config) });
  } catch {
    throw new AiError('Couldn’t reach the AI service. Check the connection, or the address in Settings.');
  }
  if (!res.ok) throw new AiError(friendly(res.status, await res.text().catch(() => '')), res.status);
  const data = (await res.json()) as { data?: { id?: string; name?: string }[]; models?: { name?: string }[] };
  const list: { id?: string; name?: string }[] = data.data ?? data.models ?? [];
  const ids = list
    .map((m): string => m.id || m.name || '')
    .filter(Boolean)
    .map((id) => id.replace(/^models\//, ''));
  return [...new Set(ids)].sort();
}

/** Pull the first JSON object out of a reply, even when it arrives wrapped in prose or a code fence. */
export function extractJson<T = unknown>(reply: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(reply);
  const text = fenced ? fenced[1] : reply;
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
