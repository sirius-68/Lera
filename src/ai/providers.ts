/**
 * AI is optional in Lera. Checking algebra is done by the built-in engine;
 * a language model only helps with the things rules are bad at — untangling a
 * messy PDF, and explaining in plain words.
 *
 * Every provider here speaks the OpenAI-compatible chat API, so one small
 * client covers all of them. Model lists change often, so the app can load
 * the provider's current list rather than trusting the defaults below.
 */
export type ProviderId = 'none' | 'gemini' | 'groq' | 'openrouter' | 'ollama' | 'custom';

export interface ProviderPreset {
  id: ProviderId;
  name: string;
  baseUrl: string;
  /** A sensible starting model; the settings screen can fetch the live list. */
  defaultModel: string;
  keyUrl?: string;
  needsKey: boolean;
  note: string;
}

export const PROVIDERS: Record<Exclude<ProviderId, 'none'>, ProviderPreset> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    needsKey: true,
    note: 'Free tier with no card. Best at reading long, messy notes. Free-tier requests may be used by Google to improve its products.',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    keyUrl: 'https://console.groq.com/keys',
    needsKey: true,
    note: 'Free plan with daily limits. Very fast replies — good for hints and “explain this”.',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '',
    keyUrl: 'https://openrouter.ai/keys',
    needsKey: true,
    note: 'One key, many models. Load the list and pick one whose name ends in “:free”.',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (on this computer)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: '',
    needsKey: false,
    note: 'Runs a model on your own machine: no key, no limits, nothing leaves the device.',
  },
  custom: {
    id: 'custom',
    name: 'Other (OpenAI-compatible)',
    baseUrl: '',
    defaultModel: '',
    needsKey: true,
    note: 'Any endpoint that accepts /chat/completions, including your own proxy server.',
  },
};

export interface AiConfig {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const NO_AI: AiConfig = { provider: 'none', baseUrl: '', model: '', apiKey: '' };

export function aiReady(c: AiConfig | undefined | null): c is AiConfig {
  if (!c || c.provider === 'none') return false;
  if (!c.baseUrl || !c.model) return false;
  const preset = PROVIDERS[c.provider as Exclude<ProviderId, 'none'>];
  return preset?.needsKey ? c.apiKey.trim().length > 0 : true;
}
