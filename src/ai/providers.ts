/**
 * AI is optional in Lera. Checking maths is done by the built-in engine; a language model only helps with
 * what rules are bad at: untangling a messy PDF, translating, and explaining in plain words.
 *
 * Two ways to reach one, both chosen when the app is built (see config.ts):
 * - 'lera': Lera's own AI router (backend/). It holds the keys and picks a model for each job. This is
 *   the one to ship: nothing secret is inside the app.
 * - 'custom': any OpenAI-compatible address with no key, for trying things on your own computer.
 */
export type ProviderId = 'none' | 'lera' | 'custom';

export interface AiConfig {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const NO_AI: AiConfig = { provider: 'none', baseUrl: '', model: '', apiKey: '' };

export function aiReady(c: AiConfig | undefined | null): c is AiConfig {
  if (!c || c.provider === 'none' || !c.baseUrl) return false;
  return c.provider === 'lera' || !!c.model;
}
