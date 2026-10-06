import { AiError, type ChatProvider, type StreamRequest } from './types';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new AiError('aborted', 'Stopped.'));
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(new AiError('aborted', 'Stopped.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function tagContent(system: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>\\n([\\s\\S]*?)\\n</${tag}>`).exec(system);
  return m?.[1]?.trim() ?? null;
}

const CONTEXT_TAGS = ['topic', 'role', 'questions', 'notes', 'documents', 'instructions'] as const;

/** Builds a deterministic reply that proves what the provider layer received. */
export function mockReply(req: Pick<StreamRequest, 'system' | 'messages'>): string {
  const last = req.messages[req.messages.length - 1];
  const prompt = (last?.content ?? '').trim();
  const images = last?.attachments?.length ?? 0;
  const lines: string[] = ['**Mock mode** — no API key is configured, so this reply is generated locally to let you try the app.', ''];

  const firstLine = prompt.split('\n')[0] ?? '';
  lines.push(`You asked: _${firstLine.slice(0, 160) || '(no text)'}_`, '');

  const ctx = CONTEXT_TAGS.map((t) => [t, tagContent(req.system, t)] as const).filter(([, v]) => v);
  if (ctx.length) {
    lines.push('Context received:');
    for (const [tag, value] of ctx) lines.push(`- **${tag}**: ${(value as string).replace(/\s+/g, ' ').slice(0, 90)}`);
    lines.push('');
  } else {
    lines.push('Context received: none.', '');
  }

  const transcript = tagContent(req.system, 'transcript');
  if (transcript !== null) {
    const count = transcript === '(empty so far)' ? 0 : transcript.split('\n').filter((l) => l.trim()).length;
    lines.push(`Meeting transcript received: ${count} line${count === 1 ? '' : 's'}.`, '');
    if (count) lines.push('- [ ] Review the first point raised — unassigned — no date', '');
  }

  if (images) lines.push(`Image attachments received: ${images}.`, '');
  lines.push(`Messages in this conversation: ${req.messages.length}.`, '', '```ts', 'const provider = "mock"; // add an API key in Settings for real answers', '```');
  return lines.join('\n');
}

export class MockProvider implements ChatProvider {
  readonly id = 'mock' as const;
  readonly label = 'Mock (offline)';

  constructor(private readonly delayMs = 14) {}

  async stream(req: StreamRequest, onDelta: (text: string) => void): Promise<void> {
    const reply = mockReply(req);
    const chunks = reply.match(/\S+\s*|\s+/g) ?? [reply];
    for (const chunk of chunks) {
      await sleep(this.delayMs, req.signal);
      onDelta(chunk);
    }
  }

  async listModels(): Promise<string[]> {
    return ['undertone-mock'];
  }

  async transcribe(audio: Uint8Array): Promise<string> {
    return `[mock transcript — received ${audio.byteLength} bytes of audio]`;
  }
}
