export interface SseEvent {
  event: string;
  data: string;
}

/** Incremental Server-Sent Events parser. Feed it decoded text chunks; it yields complete events. */
export class SseParser {
  private buffer = '';

  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    for (;;) {
      const match = /\r?\n\r?\n/.exec(this.buffer);
      if (!match) break;
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const parsed = parseBlock(block);
      if (parsed) events.push(parsed);
    }
    return events;
  }

  flush(): SseEvent[] {
    const rest = this.buffer;
    this.buffer = '';
    const parsed = rest.trim() ? parseBlock(rest) : null;
    return parsed ? [parsed] : [];
  }
}

function parseBlock(block: string): SseEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const idx = line.indexOf(':');
    const name = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (name === 'event') event = value;
    else if (name === 'data') data.push(value);
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const ev of parser.push(decoder.decode(value, { stream: true }))) yield ev;
    }
    for (const ev of parser.push(decoder.decode())) yield ev;
    for (const ev of parser.flush()) yield ev;
  } finally {
    reader.releaseLock();
  }
}
