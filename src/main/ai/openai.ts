import { readSse } from './sse';
import { type ChatProvider, type FetchLike, type StreamRequest, errorFromStatus, readErrorDetail, toAiError } from './types';

export function toOpenAiMessages(system: string, messages: StreamRequest['messages']): unknown[] {
  return [
    { role: 'system', content: system },
    ...messages.map((m) => {
      if (m.role === 'user' && m.attachments?.length) {
        return {
          role: 'user',
          content: [
            { type: 'text', text: m.content || 'Describe what is in this image and anything notable about it.' },
            ...m.attachments.map((a) => ({ type: 'image_url', image_url: { url: `data:${a.mediaType};base64,${a.data}` } })),
          ],
        };
      }
      return { role: m.role, content: m.content };
    }),
  ];
}

/** Works with OpenAI and any server that speaks the Chat Completions API (Azure-style proxies, Ollama, LM Studio…). */
export class OpenAiProvider implements ChatProvider {
  readonly id = 'openai' as const;
  readonly label = 'OpenAI';
  private readonly base: string;

  constructor(
    private readonly apiKey: string,
    baseUrl: string,
    private readonly fetchImpl: FetchLike,
  ) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  private get official(): boolean {
    return /^https:\/\/api\.openai\.com(\/|$)/.test(this.base);
  }

  async stream(req: StreamRequest, onDelta: (text: string) => void): Promise<void> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOpenAiMessages(req.system, req.messages),
      stream: true,
    };
    // The official API has moved to max_completion_tokens; many compatible servers still expect max_tokens.
    body[this.official ? 'max_completion_tokens' : 'max_tokens'] = req.maxTokens;
    if (req.temperature !== null) body.temperature = req.temperature;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (err) {
      throw toAiError(err, this.label);
    }
    if (!res.ok || !res.body) throw errorFromStatus(res.status, this.label, await readErrorDetail(res));

    try {
      for await (const ev of readSse(res.body)) {
        if (ev.data === '[DONE]') break;
        let data: { choices?: Array<{ delta?: { content?: string | null } }> };
        try {
          data = JSON.parse(ev.data);
        } catch {
          continue;
        }
        const text = data.choices?.[0]?.delta?.content;
        if (text) onDelta(text);
      }
    } catch (err) {
      throw toAiError(err, this.label);
    }
  }

  async listModels(signal: AbortSignal): Promise<string[]> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/models`, { method: 'GET', headers: { authorization: `Bearer ${this.apiKey}` }, signal });
    } catch (err) {
      throw toAiError(err, this.label);
    }
    if (!res.ok) throw errorFromStatus(res.status, this.label, await readErrorDetail(res));
    const json = (await res.json()) as { data?: Array<{ id?: unknown }> };
    return (json.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string')
      .sort();
  }

  async transcribe(audio: Uint8Array, mimeType: string, model: string, signal: AbortSignal): Promise<string> {
    const type = mimeType.split(';')[0] ?? 'audio/webm';
    const ext = type.split('/')[1] ?? 'webm';
    const form = new FormData();
    form.append('model', model);
    form.append('response_format', 'json');
    form.append('file', new Blob([new Uint8Array(audio)], { type }), `clip.${ext}`);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${this.apiKey}` }, body: form, signal });
    } catch (err) {
      throw toAiError(err, this.label);
    }
    if (!res.ok) throw errorFromStatus(res.status, this.label, await readErrorDetail(res));
    const json = (await res.json()) as { text?: unknown };
    return typeof json.text === 'string' ? json.text.trim() : '';
  }
}
