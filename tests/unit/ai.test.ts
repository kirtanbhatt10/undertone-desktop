import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnthropicProvider, toAnthropicMessages } from '../../src/main/ai/anthropic';
import { effectiveProviderId, resolveProvider } from '../../src/main/ai/index';
import { MockProvider, mockReply } from '../../src/main/ai/mock';
import { OpenAiProvider, toOpenAiMessages } from '../../src/main/ai/openai';
import { SseParser } from '../../src/main/ai/sse';
import { AiError, type FetchLike } from '../../src/main/ai/types';
import { SecretStore } from '../../src/main/store/secrets';
import { DEFAULT_SETTINGS, EMPTY_CONTEXT } from '../../src/shared/defaults';
import { buildSystemPrompt } from '../../src/shared/prompt';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

function sseResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

const base = { model: 'm', system: 'sys', messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 100, temperature: null };

test('SSE parser handles events split across chunks and CRLF', () => {
  const p = new SseParser();
  assert.deepEqual(p.push('event: a\ndata: {"x"'), []);
  assert.deepEqual(p.push(':1}\n\ndata: two\r\n\r\n: comment\n\n'), [
    { event: 'a', data: '{"x":1}' },
    { event: 'message', data: 'two' },
  ]);
  assert.deepEqual(p.push('data: tail'), []);
  assert.deepEqual(p.flush(), [{ event: 'message', data: 'tail' }]);
});

test('Anthropic provider streams text deltas and sends the right request', async () => {
  let captured: { url: string; init: RequestInit } | null = null;
  const fetchImpl: FetchLike = async (url, init) => {
    captured = { url, init };
    return sseResponse([
      'event: message_start\ndata: {"type":"message_start"}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]);
  };
  const out: string[] = [];
  await new AnthropicProvider('test-key-123', fetchImpl).stream({ ...base, signal: new AbortController().signal }, (t) => out.push(t));
  assert.deepEqual(out, ['Hel', 'lo']);
  const c = captured as unknown as { url: string; init: RequestInit };
  assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
  const headers = c.init.headers as Record<string, string>;
  assert.equal(headers['x-api-key'], 'test-key-123');
  const body = JSON.parse(String(c.init.body));
  assert.equal(body.stream, true);
  assert.equal(body.system, 'sys');
  assert.equal('temperature' in body, false, 'temperature omitted when null');
});

test('Anthropic provider maps HTTP errors to friendly codes', async () => {
  const mk = (status: number): FetchLike => async () => new Response(JSON.stringify({ error: { message: 'nope' } }), { status });
  const run = (status: number) => new AnthropicProvider('k', mk(status)).stream({ ...base, signal: new AbortController().signal }, () => undefined);
  await assert.rejects(run(401), (e: AiError) => e.code === 'auth');
  await assert.rejects(run(429), (e: AiError) => e.code === 'rate_limit');
  await assert.rejects(run(404), (e: AiError) => e.code === 'bad_request' && e.message.includes('nope'));
  await assert.rejects(run(529), (e: AiError) => e.code === 'server');
  const offline: FetchLike = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(new AnthropicProvider('k', offline).stream({ ...base, signal: new AbortController().signal }, () => undefined), (e: AiError) => e.code === 'network');
});

test('OpenAI provider streams deltas and picks the token parameter by endpoint', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    bodies.push(JSON.parse(String(init.body)));
    return sseResponse(['data: {"choices":[{"delta":{"role":"assistant"}}]}\n\ndata: {"choices":[{"delta":{"content":"A"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"B"}}]}\n\ndata: [DONE]\n\n']);
  };
  const out: string[] = [];
  await new OpenAiProvider('k', 'https://api.openai.com/v1/', fetchImpl).stream({ ...base, temperature: 0.4, signal: new AbortController().signal }, (t) => out.push(t));
  await new OpenAiProvider('k', 'http://localhost:11434/v1', fetchImpl).stream({ ...base, signal: new AbortController().signal }, () => undefined);
  assert.deepEqual(out, ['A', 'B']);
  assert.equal(bodies[0]?.max_completion_tokens, 100);
  assert.equal(bodies[0]?.temperature, 0.4);
  assert.equal(bodies[1]?.max_tokens, 100);
});

test('image attachments are converted to each provider format', () => {
  const messages = [{ role: 'user' as const, content: 'what is this', attachments: [{ id: '1', kind: 'image' as const, mediaType: 'image/png' as const, data: 'AAAA' }] }];
  const a = toAnthropicMessages(messages) as Array<{ content: Array<{ type: string; source?: { data: string } }> }>;
  assert.equal(a[0]?.content[0]?.type, 'image');
  assert.equal(a[0]?.content[0]?.source?.data, 'AAAA');
  const o = toOpenAiMessages('sys', messages) as Array<{ role: string; content: Array<{ type: string; image_url?: { url: string } }> }>;
  assert.equal(o[0]?.role, 'system');
  assert.equal(o[1]?.content[1]?.image_url?.url, 'data:image/png;base64,AAAA');
});

test('mock provider streams in several chunks, reflects context, and can be aborted', async () => {
  const context = { ...EMPTY_CONTEXT, topic: 'Quarterly planning', instructions: 'Be brief' };
  const system = buildSystemPrompt({ context, style: 'balanced' });
  const reply = mockReply({ system, messages: base.messages });
  assert.match(reply, /\*\*topic\*\*: Quarterly planning/);
  assert.match(reply, /\*\*instructions\*\*: Be brief/);

  const chunks: string[] = [];
  await new MockProvider(0).stream({ ...base, system, signal: new AbortController().signal }, (t) => chunks.push(t));
  assert.ok(chunks.length > 10);
  assert.equal(chunks.join(''), reply);

  const controller = new AbortController();
  const pending = new MockProvider(20).stream({ ...base, signal: controller.signal }, () => controller.abort());
  await assert.rejects(pending, (e: AiError) => e.code === 'aborted');
});

test('provider resolution falls back to mock without a key and never throws', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ut-ai-'));
  const noEncryption = { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => '' };
  const secrets = new SecretStore(dir, noEncryption, {});
  const fetchImpl: FetchLike = async () => new Response('');
  assert.equal(effectiveProviderId(DEFAULT_SETTINGS, secrets, {}), 'mock');
  const r = resolveProvider(DEFAULT_SETTINGS, secrets, fetchImpl, {});
  assert.equal(r.provider.id, 'mock');
  assert.equal(r.fallback, true);
  secrets.set('anthropic', 'sk-test-abcdefgh');
  assert.equal(resolveProvider(DEFAULT_SETTINGS, secrets, fetchImpl, {}).provider.id, 'anthropic');
  assert.equal(effectiveProviderId(DEFAULT_SETTINGS, secrets, { UNDERTONE_MOCK: '1' }), 'mock');
  fs.rmSync(dir, { recursive: true, force: true });
});
