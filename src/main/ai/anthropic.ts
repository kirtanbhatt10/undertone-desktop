import { readSse } from './sse';
import { AiError, type ChatProvider, type FetchLike, type StreamRequest, errorFromStatus, readErrorDetail, toAiError } from './types';

const BASE = 'https://api.anthropic.com/v1';
const VERSION = '2023-06-01';

export function toAnthropicMessages(messages: StreamRequest['messages']): unknown[] {
  return messages.map((m) => {
    if (m.role === 'user' && m.attachments?.length) {
      return {
        role: 'user',
        content: [
          ...m.attachments.map((a) => ({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } })),
          { type: 'text', text: m.content || 'Describe what is in this image and anything notable about it.' },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

export class AnthropicProvider implements ChatProvider {
  readonly id = 'anthropic' as const;
  readonly label = 'Anthropic';

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike,
  ) {}

  private headers(): Record<string, string> {
    return { 'x-api-key': this.apiKey, 'anthropic-version': VERSION, 'content-type': 'application/json' };
  }

  async stream(req: StreamRequest, onDelta: (text: string) => void): Promise<void> {
    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: toAnthropicMessages(req.messages),
      stream: true,
    };
    if (req.temperature !== null) body.temperature = Math.min(req.temperature, 1);

    let res: Response;
    try {
      res = await this.fetchImpl(`${BASE}/messages`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal: req.signal });
    } catch (err) {
      throw toAiError(err, this.label);
    }
    if (!res.ok || !res.body) throw errorFromStatus(res.status, this.label, await readErrorDetail(res));

    try {
      for await (const ev of readSse(res.body)) {
        let data: { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } };
        try {
          data = JSON.parse(ev.data);
        } catch {
          continue;
        }
        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta' && data.delta.text) onDelta(data.delta.text);
        else if (data.type === 'error') throw new AiError('server', `Anthropic stream error: ${data.error?.message ?? 'unknown'}`);
        else if (data.type === 'message_stop') break;
      }
    } catch (err) {
      throw toAiError(err, this.label);
    }
  }

  async listModels(signal: AbortSignal): Promise<string[]> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${BASE}/models?limit=100`, { method: 'GET', headers: this.headers(), signal });
    } catch (err) {
      throw toAiError(err, this.label);
    }
    if (!res.ok) throw errorFromStatus(res.status, this.label, await readErrorDetail(res));
    const json = (await res.json()) as { data?: Array<{ id?: unknown }> };
    return (json.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string');
  }
}
