import { AiConfig, NO_AI } from './providers';

/**
 * The AI model is configured when the app is built, not by the person using it.
 *
 *   LERA_AI_BASE_URL   an OpenAI-compatible endpoint, ideally your own proxy
 *   LERA_AI_MODEL      the model name to ask for
 *   LERA_AI_KEY        optional — leave it empty when the proxy holds the key
 *
 * Set them as environment variables for `npm run build` (in GitHub Actions:
 * repository secrets). With none set, the app runs on its built-in engine alone.
 */
declare const __LERA_AI__: { baseUrl: string; model: string; key: string } | undefined;

const built = typeof __LERA_AI__ !== 'undefined' ? __LERA_AI__ : undefined;

export const BUILD_AI: AiConfig =
  built && built.baseUrl && built.model
    ? { provider: 'custom', baseUrl: built.baseUrl.replace(/\/+$/, ''), model: built.model, apiKey: built.key || 'proxy' }
    : { ...NO_AI };
