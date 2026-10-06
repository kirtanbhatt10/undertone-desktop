import type { AiErrorCode, Attachment, ProviderId } from '../../shared/types';

export interface ProviderMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
}

export interface StreamRequest {
  model: string;
  system: string;
  messages: ProviderMessage[];
  maxTokens: number;
  temperature: number | null;
  signal: AbortSignal;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * The contract every model provider implements. Adding a provider means implementing this
 * interface and registering it in `ai/index.ts`; nothing else in the app knows provider details.
 */
export interface ChatProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Streams a reply, calling `onDelta` for each piece of text as it arrives. */
  stream(req: StreamRequest, onDelta: (text: string) => void): Promise<void>;
  listModels?(signal: AbortSignal): Promise<string[]>;
  transcribe?(audio: Uint8Array, mimeType: string, model: string, signal: AbortSignal): Promise<string>;
}

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export function errorFromStatus(status: number, provider: string, detail: string): AiError {
  const tail = detail ? ` — ${detail.slice(0, 300)}` : '';
  if (status === 401 || status === 403) return new AiError('auth', `${provider} rejected the API key (HTTP ${status}). Check it in Settings.`);
  if (status === 429) return new AiError('rate_limit', `${provider} rate limit or quota reached (HTTP 429)${tail}`);
  if (status === 400 || status === 404 || status === 422) return new AiError('bad_request', `${provider} could not process the request (HTTP ${status})${tail}`);
  if (status >= 500) return new AiError('server', `${provider} is having trouble (HTTP ${status}). Try again shortly.`);
  return new AiError('unknown', `${provider} returned HTTP ${status}${tail}`);
}

export function toAiError(err: unknown, provider: string): AiError {
  if (err instanceof AiError) return err;
  const e = err as { name?: string; message?: string };
  if (e?.name === 'AbortError') return new AiError('aborted', 'Stopped.');
  return new AiError('network', `Could not reach ${provider}. Check your connection. (${e?.message ?? 'network error'})`);
}

/** Pulls a short human-readable message out of a provider error body without echoing arbitrary content. */
export async function readErrorDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
      const msg = typeof json.error === 'string' ? json.error : (json.error?.message ?? json.message);
      return typeof msg === 'string' ? msg : '';
    } catch {
      return text.slice(0, 200);
    }
  } catch {
    return '';
  }
}
