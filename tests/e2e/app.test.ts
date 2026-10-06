import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { type Launched, canPressGlobalKeys, launch, mainBounds, pressCtrlAlt, send, sleep, tempUserData } from './helpers';

describe('Undertone desktop app', { timeout: 240_000 }, () => {
  let ctx: Launched;
  const errors: string[] = [];

  before(async () => {
    ctx = await launch();
    ctx.win.on('pageerror', (e) => errors.push(e.message));
    ctx.win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  });
  after(async () => {
    await ctx.close();
    fs.rmSync(ctx.userData, { recursive: true, force: true });
  });

  test('starts, loads the UI and survives missing API configuration', async () => {
    const { win, app } = ctx;
    assert.equal(await win.title(), 'Undertone');
    await win.waitForSelector('[data-testid=nav-assistant]');
    assert.match(await win.locator('[data-testid=provider-chip]').innerText(), /Mock mode/);
    assert.equal(await win.locator('[data-testid=mock-banner]').isVisible(), true);
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0]?.webContents as unknown as { getLastWebPreferences(): { contextIsolation?: boolean; sandbox?: boolean; nodeIntegration?: boolean } } | undefined;
      const p = wc?.getLastWebPreferences();
      return { contextIsolation: p?.contextIsolation, sandbox: p?.sandbox, nodeIntegration: p?.nodeIntegration };
    });
    assert.deepEqual(prefs, { contextIsolation: true, sandbox: true, nodeIntegration: false });
    assert.equal(await win.evaluate(() => typeof (globalThis as { require?: unknown }).require), 'undefined', 'no Node access in renderer');
    assert.equal(await win.evaluate(() => typeof (globalThis as { process?: unknown }).process), 'undefined');
  });

  test('chat streams a reply incrementally', async () => {
    const { win } = ctx;
    await win.fill('[data-testid=composer]', 'Explain what a mutex is');
    await win.click('[data-testid=send]');
    const reply = win.locator('[data-testid=msg-assistant]').first();
    await win.waitForSelector('[data-testid=msg-assistant][data-streaming=true] .md');
    const partial = (await reply.innerText()).length;
    assert.equal(await win.locator('[data-testid=stop]').isVisible(), true, 'stop button shown while streaming');
    await win.waitForSelector('[data-testid=msg-assistant][data-streaming=false]', { timeout: 30_000 });
    const full = await reply.innerText();
    assert.ok(full.length > partial, `reply grew while streaming (${partial} → ${full.length})`);
    assert.match(full, /You asked: Explain what a mutex is/);
    assert.match(full, /Context received: none/);
    assert.equal(await reply.locator('.codeblock code.hljs').count(), 1, 'code block rendered and highlighted');
    assert.equal(await reply.locator('strong').first().innerText(), 'Mock mode');
    assert.equal(await win.locator('[data-testid=conversation-title]').innerText(), 'Explain what a mutex is');
  });

  test('context panel content reaches the model', async () => {
    const { win } = ctx;
    await win.fill('[data-testid=ctx-topic]', 'Series A investor update');
    await win.fill('[data-testid=ctx-role]', 'Head of Product');
    await win.fill('[data-testid=ctx-instructions]', 'Answer in British English');
    await win.waitForFunction(() => document.querySelector('[data-testid=context-chip]')?.textContent?.includes('Context · 3'));
    await sleep(500); // debounce before the context is persisted in the main process
    const reply = await send(win, 'What should I open with?');
    assert.match(reply, /topic: Series A investor update/);
    assert.match(reply, /role: Head of Product/);
    assert.match(reply, /instructions: Answer in British English/);
    assert.match(reply, /Messages in this conversation: 3/);

    // Pausing context stops it being sent.
    await win.getByRole('switch', { name: 'Use context' }).click();
    await sleep(500);
    assert.match(await send(win, 'And now?'), /Context received: none/);
    await win.getByRole('switch', { name: 'Use context' }).click();
    await sleep(500);
  });

  test('copy, regenerate and stop work', async () => {
    const { win, app } = ctx;
    const last = win.locator('[data-testid=msg-assistant]').last();
    await last.locator('[data-testid=copy]').click();
    await win.waitForFunction(() => [...document.querySelectorAll('[data-testid=copy]')].some((b) => b.textContent === 'Copied'));
    const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
    assert.match(clip, /\*\*Mock mode\*\*/, 'raw markdown copied');

    const count = await win.locator('[data-testid=msg-assistant]').count();
    await win.click('[data-testid=regenerate]');
    await win.waitForSelector('[data-testid=msg-assistant][data-streaming=true]');
    await win.waitForFunction(() => !document.querySelector('[data-testid=stop]'), undefined, { timeout: 30_000 });
    assert.equal(await win.locator('[data-testid=msg-assistant]').count(), count, 'regenerate replaces the last reply');

    await win.fill('[data-testid=composer]', 'A long one to interrupt');
    await win.click('[data-testid=send]');
    await win.waitForSelector('[data-testid=msg-assistant][data-streaming=true] .md');
    await win.click('[data-testid=stop]');
    await win.waitForSelector('[data-testid=send]');
    const stopped = await win.locator('[data-testid=msg-assistant]').last().innerText();
    assert.ok(!/Messages in this conversation/.test(stopped), 'reply was cut short');
  });

  test('quick actions run on the draft', async () => {
    const { win } = ctx;
    await win.click('[data-testid=new-chat]');
    await win.fill('[data-testid=composer]', 'we shld sync tmrw abt the launch, lmk');
    await win.click('[data-testid=qa-rewrite]');
    await win.waitForSelector('[data-testid=msg-assistant][data-streaming=false]', { timeout: 30_000 });
    const user = await win.locator('[data-testid=msg-user]').last().innerText();
    assert.match(user, /Rewrite professionally/);
    assert.match(user, /we shld sync tmrw/);
    assert.match(await win.locator('[data-testid=msg-assistant]').last().innerText(), /You asked: Rewrite the following/);
    assert.match(await win.locator('[data-testid=conversation-title]').innerText(), /^Rewrite professionally: we shld/);
  });

  test('image attachment and screen-region capture reach the model', async () => {
    const { win, app } = ctx;
    await win.click('[data-testid=new-chat]');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC', 'base64');
    await win.setInputFiles('[data-testid=file-input]', { name: 'chart.png', mimeType: 'image/png', buffer: png });
    await win.waitForSelector('[data-testid=attachments] img');
    assert.match(await send(win, 'What is in this image?'), /Image attachments received: 1/);

    const [overlay] = await Promise.all([app.waitForEvent('window', { timeout: 20_000 }), win.click('[data-testid=capture]')]);
    await overlay.waitForFunction(() => (document.getElementById('shot') as HTMLImageElement | null)?.complete && !!(document.getElementById('shot') as HTMLImageElement).naturalWidth, undefined, { timeout: 15_000 });
    assert.equal((await mainBounds(app)).visible, false, 'assistant hides itself while the region is selected');
    await overlay.mouse.move(200, 160);
    await overlay.mouse.down();
    await overlay.mouse.move(520, 400, { steps: 6 });
    assert.match(await overlay.locator('#size').innerText(), /320 × 240/);
    await overlay.mouse.up();
    await win.waitForSelector('[data-testid=attachments] img', { timeout: 15_000 });
    const dims = await win.locator('[data-testid=attachments] img').evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }));
    assert.deepEqual(dims, { w: 320, h: 240 }, 'cropped to the selected region');
    assert.equal((await mainBounds(app)).visible, true);
    assert.match(await send(win, 'Describe this capture'), /Image attachments received: 1/);

    // Escape cancels without attaching anything.
    const [overlay2] = await Promise.all([app.waitForEvent('window', { timeout: 20_000 }), win.click('[data-testid=capture]')]);
    await overlay2.waitForSelector('#hint');
    await overlay2.keyboard.press('Escape').catch(() => undefined); // the key-down closes the overlay
    await sleep(600);
    assert.equal(await win.locator('[data-testid=attachments]').count(), 0);
    assert.equal((await mainBounds(app)).visible, true);
  });

  test('meeting session: transcript, tools, questions, end', async () => {
    const { win } = ctx;
    await win.click('[data-testid=nav-meeting]');
    await win.click('[data-testid=start-meeting]');
    assert.equal(await win.locator('[data-testid=meeting-status]').innerText(), 'LIVE');
    assert.equal(await win.locator('[data-testid=meeting-title]').inputValue(), 'Series A investor update', 'title seeded from context topic');
    await win.fill('[data-testid=speaker]', 'Ana');
    for (const line of ['We ship the beta on Friday.', 'Ravi owns the release notes.']) {
      await win.fill('[data-testid=line-input]', line);
      await win.press('[data-testid=line-input]', 'Enter');
    }
    const transcript = await win.locator('[data-testid=transcript]').inputValue();
    assert.match(transcript, /^\[\d\d:\d\d\] Ana: We ship the beta on Friday\.\n\[\d\d:\d\d\] Ana: Ravi owns the release notes\.\n$/);
    await win.fill('[data-testid=meeting-notes]', 'Budget approved.');

    for (const kind of ['summary', 'actionItems', 'decisions', 'followUps', 'questions']) {
      await win.click(`[data-testid=run-${kind}]`);
      await win.waitForSelector(`[data-testid=output-${kind}][data-running=false] .md`, { timeout: 30_000 });
    }
    const summary = await win.locator('[data-testid=output-summary]').innerText();
    assert.match(summary, /Meeting transcript received: 2 lines/);
    assert.match(summary, /topic: Series A investor update/, 'shared context is included in meeting tools');
    assert.equal(await win.locator('[data-testid=output-actionItems] input[type=checkbox]').count(), 1, 'checklist rendered');

    await win.fill('[data-testid=meeting-question]', 'When do we ship?');
    await win.press('[data-testid=meeting-question]', 'Enter');
    await win.waitForFunction(() => /Meeting transcript received/.test(document.querySelector('[data-testid=qa-list]')?.textContent ?? ''), undefined, { timeout: 30_000 });
    assert.match(await win.locator('[data-testid=qa-list]').innerText(), /When do we ship\?/);

    await win.click('[data-testid=stop-meeting]');
    assert.equal(await win.locator('[data-testid=meeting-status]').innerText(), 'ENDED');
    assert.equal(await win.locator('[data-testid=line-input]').isDisabled(), true);
  });

  test('history lists, searches, reopens and deletes', async () => {
    const { win } = ctx;
    await win.click('[data-testid=nav-history]');
    await win.waitForSelector('[data-testid=history-row]');
    const rows = win.locator('[data-testid=history-row]');
    assert.equal(await rows.count(), 4, '3 conversations + 1 meeting');
    assert.equal(await win.locator('[data-testid=history-row][data-kind=meeting]').count(), 1);

    await win.fill('[data-testid=history-search]', 'mutex');
    assert.equal(await rows.count(), 1);
    await rows.first().locator('.history-open').click();
    await win.waitForSelector('[data-testid=msg-assistant]');
    assert.equal(await win.locator('[data-testid=conversation-title]').innerText(), 'Explain what a mutex is');
    assert.ok((await win.locator('[data-testid=msg-user]').count()) >= 3, 'messages restored from disk');

    await win.click('[data-testid=nav-history]');
    await win.fill('[data-testid=history-search]', 'Rewrite');
    await rows.first().hover();
    await rows.first().locator('[data-testid=history-delete]').click();
    await win.click('[data-testid=confirm]');
    await win.waitForFunction(() => document.querySelectorAll('[data-testid=history-row]').length === 0);
    await win.fill('[data-testid=history-search]', '');
    assert.equal(await rows.count(), 3);
    const files = fs.readdirSync(path.join(ctx.userData, 'data', 'conversations'));
    assert.equal(files.length, 2, 'deleted conversation removed from disk');
  });

  test('settings: validation, API key handling, provider errors', async () => {
    const { win } = ctx;
    await win.click('[data-testid=nav-settings]');

    // Invalid values are rejected by the main process and the field reverts.
    await win.fill('[data-testid=max-tokens]', '5');
    await win.press('[data-testid=max-tokens]', 'Enter');
    await win.waitForSelector('[data-testid=toast]');
    assert.equal(await win.locator('[data-testid=max-tokens]').inputValue(), '2048');

    await win.getByRole('radio', { name: 'OpenAI-compatible' }).click();
    await win.fill('[data-testid=base-url]', 'http://example.com/v1');
    await win.press('[data-testid=base-url]', 'Enter');
    await win.waitForFunction(() => (document.querySelector('[data-testid=base-url]') as HTMLInputElement).value === 'https://api.openai.com/v1');

    // A key is accepted, never echoed back, and switches the app out of mock mode.
    assert.match(await win.locator('[data-testid=key-status]').innerText(), /Not configured/);
    await win.fill('[data-testid=base-url]', 'http://localhost:9/v1');
    await win.press('[data-testid=base-url]', 'Enter');
    await win.fill('[data-testid=api-key]', 'sk-e2e-not-a-real-key-000000');
    await win.click('[data-testid=save-key]');
    await win.waitForFunction(() => !/Not configured/.test(document.querySelector('[data-testid=key-status]')?.textContent ?? ''));
    assert.equal(await win.locator('[data-testid=api-key]').inputValue(), '');
    assert.ok(!(await win.content()).includes('sk-e2e-not-a-real-key'), 'key is not present anywhere in the renderer');
    assert.match(await win.locator('[data-testid=provider-chip]').innerText(), /OpenAI/);

    // An unreachable provider produces a readable error, not a crash.
    await win.click('[data-testid=new-chat]');
    await win.fill('[data-testid=composer]', 'ping');
    await win.click('[data-testid=send]');
    await win.waitForSelector('[data-testid=msg-error]', { timeout: 30_000 });
    assert.match(await win.locator('[data-testid=msg-error]').innerText(), /Could not reach OpenAI/);

    await win.click('[data-testid=nav-settings]');
    await win.click('[data-testid=remove-key]');
    await win.waitForFunction(() => /Not configured/.test(document.querySelector('[data-testid=key-status]')?.textContent ?? ''));
    await win.getByRole('radio', { name: 'Mock' }).click();
    await win.getByRole('radio', { name: 'Light' }).click();
    assert.equal(await win.evaluate(() => document.documentElement.dataset.theme), 'light');
    await win.getByRole('radio', { name: 'Dark' }).click();

    // No key material in settings, secrets or logs on disk.
    const dump = (dir: string): string => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => fs.readFileSync(path.join(d.parentPath, d.name), 'utf8')).join('\n');
    assert.ok(!dump(ctx.userData).includes('sk-e2e-not-a-real-key'), 'key never written to disk in plaintext');
  });

  test('shortcuts are registered, configurable and fire globally', async (t) => {
    const { win, app } = ctx;
    const registered = await app.evaluate(({ globalShortcut }) => ['U', 'P', 'A', 'S', 'M', 'K'].map((k) => globalShortcut.isRegistered(`CommandOrControl+Alt+${k}`)));
    assert.deepEqual(registered, [true, true, true, true, true, true]);

    // Rebind "Ask assistant" by recording a new chord in the UI.
    await win.click('[data-testid=nav-settings]');
    await win.click('[data-testid=shortcut-ask]');
    await win.keyboard.press('Control+Shift+KeyJ');
    await win.waitForFunction(() => document.querySelector('[data-testid=shortcut-ask]')?.textContent === 'Ctrl + Shift + J');
    assert.deepEqual(await app.evaluate(({ globalShortcut }) => [globalShortcut.isRegistered('CommandOrControl+Alt+A'), globalShortcut.isRegistered('CommandOrControl+Shift+J')]), [false, true]);

    // Binding two actions to the same chord is reported, not silently ignored.
    await win.click('[data-testid=shortcut-capture]');
    await win.keyboard.press('Control+Shift+KeyJ');
    await win.waitForSelector('[data-testid=shortcut-warn-capture]');
    await win.locator('[data-testid=settings-shortcuts] [aria-label="Restore default shortcut"]:not([disabled])').first().click();
    await win.locator('[data-testid=settings-shortcuts] [aria-label="Restore default shortcut"]:not([disabled])').first().click();
    await win.waitForFunction(() => !document.querySelector('[data-testid^=shortcut-warn]'));

    if (!canPressGlobalKeys()) return t.diagnostic('OS-level key injection unavailable here; verified registration only');

    pressCtrlAlt('p');
    await win.waitForSelector('[data-testid=privacy-pill]:not([data-state=off])');
    pressCtrlAlt('p');
    await win.waitForSelector('[data-testid=privacy-pill][data-state=off]');

    pressCtrlAlt('k');
    await win.waitForFunction(() => window.innerWidth < 500);
    pressCtrlAlt('k');
    await win.waitForFunction(() => window.innerWidth > 800);

    pressCtrlAlt('a');
    await win.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'composer');

    pressCtrlAlt('m');
    await win.waitForSelector('[data-testid=meeting-status]');
    assert.equal(await win.locator('[data-testid=meeting-status]').innerText(), 'LIVE');
    pressCtrlAlt('m');
    await win.waitForFunction(() => document.querySelector('[data-testid=meeting-status]')?.textContent === 'Ended');

    const [overlay] = await Promise.all([app.waitForEvent('window', { timeout: 20_000 }), Promise.resolve().then(() => pressCtrlAlt('s'))]);
    await overlay.waitForSelector('#hint');
    await overlay.keyboard.press('Escape').catch(() => undefined);
    await sleep(500);

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus());
    await sleep(200);
    const focused = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocused());
    pressCtrlAlt('u');
    await sleep(500);
    if (focused) {
      assert.equal((await mainBounds(app)).visible, false, 'toggle hides the focused window');
      pressCtrlAlt('u');
      await sleep(500);
    }
    assert.equal((await mainBounds(app)).visible, true);
  });

  test('compact floating mode', async () => {
    const { win, app } = ctx;
    await win.click('[data-testid=tab-assistant]', { force: true }).catch(() => win.click('[data-testid=nav-assistant]'));
    const full = await mainBounds(app);
    await win.click('[data-testid=toggle-compact]');
    await win.waitForFunction(() => window.innerWidth < 500);
    const compact = await mainBounds(app);
    assert.ok(compact.width <= 440 && compact.width < full.width);
    assert.equal(compact.onTop, true, 'compact window floats above other apps');
    assert.equal(await win.locator('.sidebar').isVisible(), false);
    assert.equal(await win.locator('[data-testid=tab-meeting]').isVisible(), true, 'navigation moves into the title bar');
    assert.equal(await win.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal overflow');
    await win.click('[data-testid=tab-history]');
    await win.locator('[data-testid=history-row] .history-open').last().click();
    await win.waitForSelector('[data-testid=msg-assistant]');
    await win.click('[data-testid=toggle-compact]');
    await win.waitForFunction(() => window.innerWidth > 800);
    const restored = await mainBounds(app);
    assert.equal(restored.width, full.width, 'full-size bounds restored');
    assert.equal(restored.onTop, false);
  });

  test('settings and history persist across a restart; reset wipes everything', async () => {
    await ctx.win.click('[data-testid=nav-settings]');
    await ctx.win.getByRole('radio', { name: 'Concise' }).click();
    await sleep(300);
    const userData = ctx.userData;
    await ctx.close();
    ctx = await launch({ userData });
    const { win } = ctx;
    assert.ok((await win.locator('[data-testid=recent-list] .side-item').count()) >= 2, 'history restored');
    assert.equal(await win.locator('[data-testid=ctx-topic]').inputValue(), 'Series A investor update', 'context restored');
    await win.click('[data-testid=nav-settings]');
    assert.equal(await win.getByRole('radio', { name: 'Concise' }).getAttribute('aria-checked'), 'true');
    assert.equal(await win.getByRole('radio', { name: 'Mock', exact: true }).getAttribute('aria-checked'), 'true');

    await win.click('[data-testid=reset-data]');
    await win.click('[data-testid=confirm]');
    await win.waitForFunction(() => document.querySelectorAll('[data-testid=recent-list] .side-item').length === 0);
    assert.equal(await win.locator('[data-testid=ctx-topic]').inputValue(), '');
    assert.equal(fs.existsSync(path.join(userData, 'data', 'conversations')), false);
    assert.equal(fs.existsSync(path.join(userData, 'data', 'meetings')), false);
    assert.equal(fs.existsSync(path.join(userData, 'data', 'settings.json')), false);
  });

  test('no renderer errors were logged', () => {
    const real = errors.filter((e) => !/Could not reach|net::ERR|Failed to load resource/.test(e));
    assert.deepEqual(real, []);
  });
});

describe('Meeting dictation', { timeout: 120_000 }, () => {
  test('asks for consent before recording and appends the transcription', async () => {
    const userData = tempUserData();
    const ctx = await launch({ userData, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    try {
      const { win } = ctx;
      await win.click('[data-testid=nav-meeting]');
      await win.click('[data-testid=start-meeting]');
      await win.click('[data-testid=dictate]');
      assert.match(await win.locator('[data-testid=recording-notice]').innerText(), /may require the consent of everyone/);
      assert.equal(await win.locator('[data-testid=transcript]').inputValue(), '', 'nothing recorded before consent');
      await win.click('[data-testid=consent-accept]');
      await win.waitForFunction(() => /Listening/.test(document.querySelector('[data-testid=dictate]')?.textContent ?? ''), undefined, { timeout: 15_000 });
      await sleep(2500);
      await win.click('[data-testid=dictate]');
      await win.waitForFunction(() => /mock transcript — received \d+ bytes/.test((document.querySelector('[data-testid=transcript]') as HTMLTextAreaElement).value), undefined, { timeout: 20_000 });
    } finally {
      await ctx.close();
      fs.rmSync(userData, { recursive: true, force: true });
    }
  });
});
