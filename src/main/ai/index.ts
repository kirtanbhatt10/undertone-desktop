import type { ProviderId, Settings } from '../../shared/types';
import type { SecretStore } from '../store/secrets';
import { AnthropicProvider } from './anthropic';
import { MockProvider } from './mock';
import { OpenAiProvider } from './openai';
import { baseUrlSchema } from '../schemas';
import type { ChatProvider, FetchLike } from './types';

export interface ResolvedProvider {
  provider: ChatProvider;
  model: string;
  /** True when the user's chosen provider had no key and the mock was substituted. */
  fallback: boolean;
}

/** Which provider will answer, given the settings and the keys available. */
export function effectiveProviderId(settings: Settings, secrets: SecretStore, env: NodeJS.ProcessEnv = process.env): ProviderId {
  if (env.UNDERTONE_MOCK === '1') return 'mock';
  if (settings.provider === 'mock') return 'mock';
  return secrets.get(settings.provider) ? settings.provider : 'mock';
}

/** The single place where provider ids are mapped to implementations. */
export function resolveProvider(settings: Settings, secrets: SecretStore, fetchImpl: FetchLike, env: NodeJS.ProcessEnv = process.env): ResolvedProvider {
  const id = effectiveProviderId(settings, secrets, env);
  const fallback = id !== settings.provider;
  if (id === 'anthropic') return { provider: new AnthropicProvider(secrets.get('anthropic') as string, fetchImpl), model: settings.models.anthropic, fallback };
  if (id === 'openai') {
    // OPENAI_BASE_URL only applies while the setting is still at its default, and must pass the same validation.
    const envBase = baseUrlSchema.safeParse(env.OPENAI_BASE_URL?.trim() ?? '');
    const base = envBase.success && settings.openaiBaseUrl === 'https://api.openai.com/v1' ? envBase.data : settings.openaiBaseUrl;
    return { provider: new OpenAiProvider(secrets.get('openai') as string, base, fetchImpl), model: settings.models.openai, fallback };
  }
  return { provider: new MockProvider(), model: settings.models.mock, fallback };
}

export type { ChatProvider } from './types';
