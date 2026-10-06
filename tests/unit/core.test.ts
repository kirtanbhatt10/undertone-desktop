import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseEnv } from '../../src/main/env';
import { redact } from '../../src/main/logger';
import { getPrivacyCapability, judgeProbe, probeFraction } from '../../src/main/privacyProbe';
import { aiRequestSchema, apiKeySchema, baseUrlSchema, conversationSchema, settingsPatchSchema } from '../../src/main/schemas';
import { Collection } from '../../src/main/store/collection';
import { SecretStore } from '../../src/main/store/secrets';
import { SettingsStore, loadSettings } from '../../src/main/store/settings';
import { acceleratorFromEvent, formatAccelerator, validateAccelerator } from '../../src/shared/accelerator';
import { QUICK_ACTIONS, buildQuickActionPrompt } from '../../src/shared/actions';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, EMPTY_CONTEXT } from '../../src/shared/defaults';
import { buildSystemPrompt, hasActiveContext, titleFromText } from '../../src/shared/prompt';
import type { Conversation } from '../../src/shared/types';
import type { ZodType } from 'zod';

const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'ut-core-'));

test('system prompt includes context only when enabled and filled', () => {
  const now = new Date('2026-01-02T00:00:00Z');
  const empty = buildSystemPrompt({ context: EMPTY_CONTEXT, style: 'concise', now });
  assert.ok(!empty.includes('<user_context>'));
  assert.match(empty, /2026-01-02/);

  const context = { ...EMPTY_CONTEXT, role: 'Staff engineer interview', documents: 'CV text' };
  const withCtx = buildSystemPrompt({ context, style: 'concise', now });
  assert.match(withCtx, /<role[^>]*>\nStaff engineer interview\n<\/role>/);
  assert.match(withCtx, /<documents[^>]*>\nCV text\n<\/documents>/);
  assert.ok(!withCtx.includes('<topic'));

  assert.equal(hasActiveContext({ ...context, enabled: false }), false);
  assert.ok(!buildSystemPrompt({ context: { ...context, enabled: false }, style: 'concise', now }).includes('Staff engineer'));
});

test('meeting mode embeds transcript and notes', () => {
  const p = buildSystemPrompt({ context: EMPTY_CONTEXT, style: 'balanced', mode: 'meeting', meeting: { title: 'Sync "A"', transcript: '[10:00] Ana: ship Friday', notes: 'budget ok' } });
  assert.match(p, /<transcript>\n\[10:00\] Ana: ship Friday\n<\/transcript>/);
  assert.match(p, /<notes>\nbudget ok\n<\/notes>/);
  assert.match(p, /<meeting title="Sync 'A'">/);
});

test('quick actions and titles', () => {
  assert.equal(QUICK_ACTIONS.length, 10);
  const translate = QUICK_ACTIONS.find((a) => a.id === 'translate');
  assert.ok(translate);
  const prompt = buildQuickActionPrompt(translate, '  hola  ', 'German');
  assert.match(prompt, /into German/);
  assert.ok(prompt.endsWith('"""\nhola\n"""'));
  assert.equal(titleFromText('## What is **Rust**?\nmore'), 'What is Rust?');
  assert.equal(titleFromText(''), 'New conversation');
  assert.ok(titleFromText('x'.repeat(200)).length <= 56);
});

test('accelerators are validated, formatted and built from key events', () => {
  for (const a of Object.values(DEFAULT_SHORTCUTS)) assert.equal(validateAccelerator(a).ok, true, a);
  assert.equal(validateAccelerator('A').ok, false);
  assert.equal(validateAccelerator('Shift+A').ok, false);
  assert.equal(validateAccelerator('Control+Bogus+A').ok, false);
  assert.equal(validateAccelerator('Control+Alt+NotAKey').ok, false);
  assert.equal(validateAccelerator('Control+Control+A').ok, false);
  assert.equal(formatAccelerator('CommandOrControl+Alt+U', 'win32'), 'Ctrl + Alt + U');
  assert.equal(formatAccelerator('CommandOrControl+Alt+U', 'darwin'), '⌘ ⌥ U');
  const ev = { key: 'j', code: 'KeyJ', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true };
  assert.equal(acceleratorFromEvent(ev, 'win32'), 'CommandOrControl+Shift+J');
  assert.equal(acceleratorFromEvent({ ...ev, key: 'Control', code: 'ControlLeft' }, 'win32'), null);
});

test('privacy capability per platform and OS build', () => {
  assert.equal(getPrivacyCapability('win32', '10.0.22631').level, 'full');
  assert.equal(getPrivacyCapability('win32', '10.0.19041').level, 'full');
  assert.match(getPrivacyCapability('win32', '10.0.19041').mechanism, /WDA_EXCLUDEFROMCAPTURE/);
  assert.equal(getPrivacyCapability('win32', '10.0.18363').level, 'partial');
  assert.equal(getPrivacyCapability('win32', '6.1.7601').level, 'partial');
  assert.equal(getPrivacyCapability('darwin', '24.0.0').level, 'partial');
  assert.equal(getPrivacyCapability('linux', '6.8.0').level, 'unsupported');
});

test('capture probe finds the probe colour only where it is', () => {
  const size = { width: 200, height: 100 };
  const bitmap = new Uint8Array(size.width * size.height * 4);
  for (let y = 20; y < 80; y++) for (let x = 50; x < 150; x++) {
    const i = (y * size.width + x) * 4;
    bitmap[i] = 255; bitmap[i + 1] = 0; bitmap[i + 2] = 255; bitmap[i + 3] = 255; // BGRA magenta
  }
  assert.ok(probeFraction(bitmap, size, { x: 50, y: 20, width: 100, height: 60 }) > 0.95);
  assert.equal(probeFraction(bitmap, size, { x: 0, y: 0, width: 40, height: 15 }), 0);
  assert.equal(probeFraction(bitmap, size, { x: 500, y: 500, width: 10, height: 10 }), 0);

  const full = getPrivacyCapability('win32', '10.0.22631');
  const none = getPrivacyCapability('linux', '6.0.0');
  assert.equal(judgeProbe(true, 0, full).verdict, 'protected');
  assert.equal(judgeProbe(true, 0.9, full).verdict, 'exposed');
  assert.match(judgeProbe(true, 0.9, none).message, /no supported capture-exclusion/);
  assert.equal(judgeProbe(false, 0.9, full).verdict, 'visible-as-expected');
  assert.equal(judgeProbe(false, 0, full).verdict, 'inconclusive');
});

test('settings load tolerantly and reject invalid updates', () => {
  const dir = tmp();
  const file = path.join(dir, 'settings.json');
  assert.deepEqual(loadSettings(file), DEFAULT_SETTINGS);
  fs.writeFileSync(file, '{ not json');
  assert.deepEqual(loadSettings(file), DEFAULT_SETTINGS);
  fs.writeFileSync(file, JSON.stringify({ theme: 'light', maxTokens: -5, shortcuts: { ask: 'Control+Alt+J' }, unknown: 1 }));
  const loaded = loadSettings(file);
  assert.equal(loaded.theme, 'light');
  assert.equal(loaded.maxTokens, DEFAULT_SETTINGS.maxTokens, 'invalid field falls back to default');
  assert.equal(loaded.shortcuts.ask, 'Control+Alt+J');
  assert.equal(loaded.shortcuts.capture, DEFAULT_SHORTCUTS.capture);

  const store = new SettingsStore(dir);
  store.update({ privacyMode: true, models: { openai: 'gpt-x' } });
  assert.equal(new SettingsStore(dir).get().privacyMode, true);
  assert.equal(new SettingsStore(dir).get().models.openai, 'gpt-x');
  assert.equal(new SettingsStore(dir).get().models.anthropic, DEFAULT_SETTINGS.models.anthropic);
  assert.throws(() => store.update({ openaiBaseUrl: 'http://evil.example.com/v1' }));
  store.setContext({ ...EMPTY_CONTEXT, topic: 'T' });
  assert.equal(new SettingsStore(dir).getContext().topic, 'T');
  store.reset();
  assert.deepEqual(new SettingsStore(dir).get(), DEFAULT_SETTINGS);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('IPC schemas reject malformed and oversized input', () => {
  assert.equal(baseUrlSchema.safeParse('https://api.openai.com/v1').success, true);
  assert.equal(baseUrlSchema.safeParse('http://localhost:11434/v1').success, true);
  assert.equal(baseUrlSchema.safeParse('http://192.168.1.5/v1').success, false);
  assert.equal(baseUrlSchema.safeParse('file:///etc/passwd').success, false);
  assert.equal(baseUrlSchema.safeParse('https://user:pw@host/v1').success, false);
  assert.equal(settingsPatchSchema.safeParse({ theme: 'neon' }).success, false);
  assert.equal(settingsPatchSchema.safeParse({ evil: true }).success, false, 'unknown keys rejected');
  assert.equal(settingsPatchSchema.safeParse({ shortcuts: { ask: 'A' } }).success, false);
  assert.equal(settingsPatchSchema.safeParse({ models: { anthropic: 'bad model; rm -rf' } }).success, false);
  assert.equal(apiKeySchema.safeParse('sk-with space-in-it').success, false);
  assert.equal(apiKeySchema.safeParse('sk-abcdefghijkl').success, true);
  const id = '3f2b1c9e-8a47-4b1e-9d53-1c2a7e5f6a10';
  assert.equal(aiRequestSchema.safeParse({ requestId: id, messages: [{ role: 'user', content: 'hi' }] }).success, true);
  assert.equal(aiRequestSchema.safeParse({ requestId: id, messages: [{ role: 'system', content: 'hi' }] }).success, false);
  assert.equal(aiRequestSchema.safeParse({ requestId: 'nope', messages: [{ role: 'user', content: 'hi' }] }).success, false);
  assert.equal(aiRequestSchema.safeParse({ requestId: id, messages: [{ role: 'user', content: 'x', attachments: [{ id: 'a', kind: 'image', mediaType: 'image/svg+xml', data: 'AAAA' }] }] }).success, false);
});

test('collections store documents and cannot be steered outside their directory', () => {
  const dir = tmp();
  const col = new Collection<Conversation>(path.join(dir, 'c'), conversationSchema as ZodType<Conversation>);
  const conv: Conversation = { id: '3f2b1c9e-8a47-4b1e-9d53-1c2a7e5f6a10', title: 'T', createdAt: 1, updatedAt: 2, messages: [{ id: 'm', role: 'user', content: 'hi', createdAt: 1 }] };
  col.save(conv);
  assert.deepEqual(col.get(conv.id), conv);
  assert.equal(col.list().length, 1);
  assert.throws(() => col.get('../../etc/passwd'));
  assert.throws(() => col.delete('..\\..\\secrets'));
  assert.throws(() => col.save({ ...conv, id: '../x' }));
  fs.writeFileSync(path.join(dir, 'c', 'junk.json'), '{"nope":1}');
  assert.equal(col.list().length, 1, 'invalid files are ignored');
  col.delete(conv.id);
  assert.equal(col.get(conv.id), null);
  col.clear();
  assert.equal(col.list().length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('secret store encrypts at rest, or stays in memory when encryption is unavailable', () => {
  const dir = tmp();
  const xor = (b: Buffer): Buffer => Buffer.from(b.map((x) => x ^ 0x5a));
  const enc = { isEncryptionAvailable: () => true, encryptString: (s: string) => xor(Buffer.from(s)), decryptString: (b: Buffer) => xor(b).toString() };
  const store = new SecretStore(dir, enc, {});
  assert.equal(store.source('anthropic'), 'none');
  store.set('anthropic', 'sk-ant-secret-value-123');
  assert.equal(store.source('anthropic'), 'stored');
  assert.equal(new SecretStore(dir, enc, {}).get('anthropic'), 'sk-ant-secret-value-123');
  assert.ok(!fs.readFileSync(path.join(dir, 'secrets.json'), 'utf8').includes('sk-ant-secret-value-123'), 'plaintext never written');
  store.clear('anthropic');
  assert.equal(store.get('anthropic'), null);

  const dir2 = tmp();
  const none = { isEncryptionAvailable: () => false, encryptString: () => { throw new Error('unavailable'); }, decryptString: () => '' };
  const mem = new SecretStore(dir2, none, { OPENAI_API_KEY: 'sk-from-env-12345' });
  mem.set('anthropic', 'sk-ant-memory-only');
  assert.equal(mem.source('anthropic'), 'session');
  assert.equal(fs.existsSync(path.join(dir2, 'secrets.json')), false, 'nothing written without encryption');
  assert.equal(mem.source('openai'), 'env');
  assert.equal(mem.get('openai'), 'sk-from-env-12345');
  assert.equal(JSON.stringify(mem.status()).includes('sk-'), false, 'status never contains key material');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(dir2, { recursive: true, force: true });
});

test('logger redaction and .env parsing', () => {
  const line = redact('x-api-key: sk-ant-api03-AbCdEfGhIjKlMnOp, Authorization: Bearer abcdefghijklmnop.qrs and sk-proj-ABCDEFGHIJKLMNOPQRST');
  assert.ok(!/AbCdEfGh|abcdefghijklmnop|ABCDEFGHIJKL/.test(line), line);
  assert.deepEqual(parseEnv('# c\nA=1\nB="two words"\n bad line\nC=\'x\'\n1X=no\n'), { A: '1', B: 'two words', C: 'x' });
});
