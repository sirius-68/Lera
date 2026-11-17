import { AiConfig } from './providers';
import { t } from '../i18n';

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
  if (status === 401 || status === 403) return t('The AI service turned the request away. Lera will carry on without it.');
  if (status === 404) return t('The AI service wasn’t found at the address this app was built with.');
  if (status === 429) return t('Today’s limit for Lera’s AI has been reached. Lera will carry on without it.');
  if (status >= 500) return t('The AI service is having trouble. Lera will carry on without it.');
  const detail = body.slice(0, 160).replace(/\s+/g, ' ');
  return t('The AI service refused the request ({0}). {1}', { 0: status, 1: detail });
}

/** The jobs Lera's AI router knows (backend/supabase/functions/_shared/router.ts). It picks the model for each. */
export type AiTask = 'structure' | 'translate' | 'chat' | 'checkOpen' | 'diagnose' | 'simplify';

/** A random id this phone keeps, so the router can hold each phone to a daily limit. It says nothing about the person. */
function deviceId(): string {
  try {
    let id = localStorage.getItem('lera.device');
    if (!id) {
      id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('lera.device', id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

/** One chat completion. Returns the reply text. */
export async function chat(
  config: AiConfig,
  messages: ChatMessage[],
  opts: { task: AiTask; level?: number; json?: boolean; temperature?: number; maxTokens?: number; signal?: AbortSignal },
): Promise<string> {
  const router = config.provider === 'lera';
  const send = async (withJsonMode: boolean): Promise<Response> => {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: opts.temperature ?? 0.2,
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (withJsonMode) body.response_format = { type: 'json_object' };
    // the router chooses the model from the job; a plain endpoint gets an ordinary chat request
    if (router) body.lera = { task: opts.task, level: opts.level ?? 0 };
    return fetch(router ? base(config) : `${base(config)}/chat/completions`, {
      method: 'POST',
      headers: router ? { 'Content-Type': 'application/json', 'X-Lera-Device': deviceId() } : headers(config),
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  };

  let res: Response;
  try {
    res = await send(!!opts.json && !router);
    // some models reject JSON mode; the prompt asks for JSON anyway, so retry without the flag
    if (res.status === 400 && opts.json) res = await send(false);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new AiError(t('Couldn’t reach the AI service. Check the connection.'));
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
  throw new AiError(t('The AI service replied with nothing usable.'));
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
