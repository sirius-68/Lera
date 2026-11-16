import { AiConfig, NO_AI } from './providers';

/**
 * Where the app's AI requests go, set when the app is built, never by the person using it:
 *
 *   LERA_AI_URL   the address of Lera's AI router (backend/supabase/functions/lera-ai),
 *                 e.g. https://<project>.supabase.co/functions/v1/lera-ai
 *
 * No key is ever built into the app: anything inside an app can be copied out of it. The router holds
 * the provider keys. With LERA_AI_URL unset, the app runs on its built-in engine alone.
 *
 * For trying a model on your own computer with no router: LERA_AI_BASE_URL and LERA_AI_MODEL point
 * straight at a keyless OpenAI-compatible server (Ollama, or `npm run preview` with a .env).
 */
declare const __LERA_AI__: { url: string; baseUrl: string; model: string } | undefined;

const built = typeof __LERA_AI__ !== 'undefined' ? __LERA_AI__ : undefined;

export const BUILD_AI: AiConfig = built?.url
  ? { provider: 'lera', baseUrl: built.url.replace(/\/+$/, ''), model: 'auto', apiKey: '' }
  : built?.baseUrl && built.model
    ? { provider: 'custom', baseUrl: built.baseUrl.replace(/\/+$/, ''), model: built.model, apiKey: '' }
    : { ...NO_AI };
