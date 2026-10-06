/**
 * Exercises a real provider implementation end to end: the app talks HTTP + SSE to a local
 * OpenAI-compatible server through Chromium's network stack. Also produces the README screenshots
 * when UNDERTONE_SHOTS is set.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { startFakeProvider } from './fakeProvider';
import { type Launched, launch, send, shot, sleep } from './helpers';

describe('OpenAI-compatible provider over real HTTP', { timeout: 240_000 }, () => {
  let ctx: Launched;
  let provider: Awaited<ReturnType<typeof startFakeProvider>>;

  before(async () => {
    provider = await startFakeProvider();
    ctx = await launch();
  });
  after(async () => {
    await ctx.close();
    await provider.close();
    fs.rmSync(ctx.userData, { recursive: true, force: true });
  });

  test('a wrong key gives a clear authentication error', async () => {
    const { win } = ctx;
    await win.click('[data-testid=nav-settings]');
    await win.getByRole('radio', { name: 'OpenAI-compatible' }).click();
    await win.fill('[data-testid=base-url]', provider.url);
    await win.press('[data-testid=base-url]', 'Enter');
    await win.fill('[data-testid=api-key]', 'sk-wrong-key-000000');
    await win.click('[data-testid=save-key]');
    await win.waitForFunction(() => !/Not configured/.test(document.querySelector('[data-testid=key-status]')?.textContent ?? ''));
    await win.click('[data-testid=nav-assistant]');
    await win.fill('[data-testid=composer]', 'hello');
    await win.click('[data-testid=send]');
    await win.waitForSelector('[data-testid=msg-error]', { timeout: 30_000 });
    assert.match(await win.locator('[data-testid=msg-error]').innerText(), /rejected the API key \(HTTP 401\)/);
  });

  test('configure, fetch models, and stream a reply with context', async () => {
    const { win } = ctx;
    await win.click('[data-testid=nav-settings]');
    await win.fill('[data-testid=api-key]', 'sk-local-test-key-0001');
    await win.click('[data-testid=save-key]');
    await win.waitForFunction(() => (document.querySelector('[data-testid=api-key]') as HTMLInputElement).value === '');
    await win.click('[data-testid=fetch-models]');
    await win.waitForFunction(() => [...document.querySelectorAll('[data-testid=toast]')].some((t) => /2 models available/.test(t.textContent ?? '')));
    await win.fill('[data-testid=model]', 'local-large');
    await win.press('[data-testid=model]', 'Enter');
    await win.waitForFunction(() => /local-large/.test(document.querySelector('[data-testid=provider-chip]')?.textContent ?? ''));
    assert.equal(await win.locator('[data-testid=mock-banner]').count(), 0);

    await win.click('[data-testid=new-chat]');
    await win.fill('[data-testid=ctx-topic]', 'Q3 roadmap review with the platform team');
    await win.fill('[data-testid=ctx-role]', 'Product lead presenting to engineering leadership');
    await win.fill('[data-testid=ctx-notes]', 'Last quarter: 9 of 11 commitments shipped. Two enterprise renewals depend on billing.');
    await sleep(500);
    const reply = await send(win, 'How should I open the meeting?');
    assert.match(reply, /Open with the outcome, not the agenda/);
    assert.match(reply, /Keep it under ninety seconds/);

    const req = provider.requests[provider.requests.length - 1];
    assert.ok(req);
    assert.equal(req.path, '/v1/chat/completions');
    assert.equal(req.body.model, 'local-large');
    assert.equal(req.body.stream, true);
    assert.equal(req.body.max_tokens, 2048);
    const [system, ...rest] = req.body.messages ?? [];
    assert.equal(system?.role, 'system');
    assert.match(String(system?.content), /<topic[^>]*>\nQ3 roadmap review with the platform team\n<\/topic>/);
    assert.match(String(system?.content), /9 of 11 commitments shipped/);
    assert.deepEqual(rest.map((m) => m.role), ['user', 'assistant', 'user'].slice(-rest.length));
    assert.equal(rest[rest.length - 1]?.content, 'How should I open the meeting?');
    if (process.env.UNDERTONE_SHOTS) await sleep(4500); // let toasts clear
    await shot(win, 'assistant');
  });

  test('meeting tools send the transcript and stream structured output', async () => {
    const { win } = ctx;
    await win.click('[data-testid=nav-meeting]');
    await win.click('[data-testid=start-meeting]');
    const lines: Array<[string, string]> = [
      ['Ana', 'Beta is on track for Friday if the cold-start crash is fixed.'],
      ['Ravi', 'Fix is in review, I will land it by Thursday.'],
      ['Mei', 'Two enterprise renewals depend on billing, can we pull the migration ahead of search?'],
      ['Ana', 'Agreed. Search relevance moves to next quarter.'],
    ];
    for (const [speaker, line] of lines) {
      await win.fill('[data-testid=speaker]', speaker);
      await win.fill('[data-testid=line-input]', line);
      await win.press('[data-testid=line-input]', 'Enter');
    }
    await win.fill('[data-testid=meeting-notes]', 'Ask about rollback plan.\nOnboarding revision due Wednesday.');
    for (const kind of ['summary', 'actionItems', 'decisions']) {
      await win.click(`[data-testid=run-${kind}]`);
      await win.waitForSelector(`[data-testid=output-${kind}][data-running=false] .md`, { timeout: 30_000 });
    }
    assert.match(await win.locator('[data-testid=output-summary]').innerText(), /Beta ships Friday/);
    assert.equal(await win.locator('[data-testid=output-actionItems] input[type=checkbox]').count(), 4);
    assert.match(await win.locator('[data-testid=output-decisions]').innerText(), /Still open/);

    const summaryReq = provider.requests.find((r) => /Summarize this meeting/.test(String(r.body.messages?.[1]?.content)));
    assert.ok(summaryReq);
    const system = String(summaryReq.body.messages?.[0]?.content);
    assert.match(system, /<transcript>\n\[\d\d:\d\d\] Ana: Beta is on track/);
    assert.match(system, /Ravi: Fix is in review/);
    assert.match(system, /<notes>\nAsk about rollback plan\./);

    await win.fill('[data-testid=meeting-question]', 'When do we ship?');
    await win.press('[data-testid=meeting-question]', 'Enter');
    await win.waitForFunction(() => /Friday\. The beta ships then/.test(document.querySelector('[data-testid=qa-list]')?.textContent ?? ''), undefined, { timeout: 30_000 });
    await win.click('[data-testid=toggle-context]');
    await win.locator('[data-testid=transcript]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await sleep(2200);
    await shot(win, 'meeting');
  });

  test('README screenshots for the remaining views', async (t) => {
    if (!process.env.UNDERTONE_SHOTS) return t.skip('set UNDERTONE_SHOTS to regenerate screenshots');
    const { win } = ctx;
    await win.click('[data-testid=stop-meeting]');
    await win.click('[data-testid=nav-history]');
    await sleep(4000);
    await shot(win, 'history');

    await win.click('[data-testid=nav-settings]');
    await win.click('[data-testid=privacy-pill]');
    await win.locator('[data-testid=settings-privacy]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await sleep(4000);
    await shot(win, 'settings-privacy');
    await win.click('[data-testid=privacy-pill]');

    await win.getByRole('radio', { name: 'Light' }).click();
    await win.locator('[data-testid=settings-ai]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await sleep(4000);
    await shot(win, 'settings-light');
    await win.getByRole('radio', { name: 'Dark' }).click();

    await win.click('[data-testid=toggle-compact]');
    await win.waitForFunction(() => window.innerWidth < 500);
    await win.click('[data-testid=tab-history]');
    await win.locator('[data-testid=history-row][data-kind=chat] .history-open').first().click();
    await win.waitForSelector('[data-testid=msg-assistant]');
    await win.locator('[data-testid=messages]').evaluate((el) => (el.scrollTop = 0));
    await sleep(4000);
    await shot(win, 'compact');
  });
});
