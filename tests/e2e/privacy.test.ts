/**
 * Privacy Mode validation.
 *
 * Runs the real app and checks, on the machine it runs on:
 *   1. what the OS reports for the window (content protection flag),
 *   2. whether the window actually appears in a screen capture taken through the OS capture API
 *      (the same path screen-sharing apps use: Windows Graphics Capture / DXGI on Windows).
 *
 * Expected results differ by platform and the assertions say so explicitly; see docs/PRIVACY_MODE.md.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { after, before, describe, test } from 'node:test';
import { getPrivacyCapability } from '../../src/main/privacyProbe';
import { PRIVACY_NOTICE } from '../../src/shared/defaults';
import { type Launched, canPressGlobalKeys, launch, pressCtrlAlt } from './helpers';

const capability = getPrivacyCapability(process.platform, os.release());

async function selfTest(ctx: Launched): Promise<string> {
  await ctx.win.click('[data-testid=privacy-selftest]');
  await ctx.win.waitForSelector('[data-testid=privacy-result]', { timeout: 30_000 });
  const verdict = await ctx.win.locator('[data-testid=privacy-result]').getAttribute('data-verdict');
  return verdict ?? '';
}

const isProtected = (ctx: Launched): Promise<boolean> =>
  ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Undertone')?.isContentProtected() ?? false);

describe(`Privacy Mode on ${process.platform} ${os.release()} (${capability.level})`, { timeout: 180_000 }, () => {
  let ctx: Launched;
  before(async () => {
    ctx = await launch();
    await ctx.win.click('[data-testid=nav-settings]');
    await ctx.win.locator('[data-testid=settings-privacy]').scrollIntoViewIfNeeded();
  });
  after(async () => {
    await ctx.close();
    fs.rmSync(ctx.userData, { recursive: true, force: true });
  });

  test('the UI states the capability and the limitation notice honestly', async () => {
    const { win } = ctx;
    assert.equal(await win.locator('[data-testid=privacy-capability]').getAttribute('data-level'), capability.level);
    assert.match(await win.locator('[data-testid=privacy-capability]').innerText(), new RegExp(capability.mechanism.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(await win.locator('[data-testid=privacy-notice]').innerText(), PRIVACY_NOTICE);
    assert.equal(await win.locator('[data-testid=privacy-pill]').getAttribute('data-state'), 'off');
  });

  test('with Privacy Mode OFF the window is visible to screen capture (control)', async () => {
    assert.equal(await isProtected(ctx), false);
    assert.equal(await selfTest(ctx), 'visible-as-expected', 'the probe must be able to see an unprotected window, otherwise a "protected" result would be meaningless');
  });

  test('with Privacy Mode ON the window is excluded where the OS supports it', async () => {
    const { win } = ctx;
    await win.click('[data-testid=privacy-pill]');
    const expectedState = { full: 'on', partial: 'partial', unsupported: 'unsupported' }[capability.level];
    await win.waitForSelector(`[data-testid=privacy-pill][data-state=${expectedState}]`);
    assert.equal(await win.locator('[data-testid=app]').evaluate((el) => el.classList.contains('privacy-on')), true, 'window shows the Privacy Mode indicator to the local user');
    assert.equal(await win.locator('[data-testid=app]').isVisible(), true, 'window is still visible locally');

    const verdict = await selfTest(ctx);
    if (process.platform === 'win32') {
      assert.equal(await isProtected(ctx), true, 'Windows reports the window as content-protected');
      if (capability.level === 'full') assert.equal(verdict, 'protected', 'WDA_EXCLUDEFROMCAPTURE must remove the window from an OS screen capture');
      else assert.ok(['protected', 'exposed'].includes(verdict));
    } else if (process.platform === 'darwin') {
      assert.equal(await isProtected(ctx), true);
      assert.ok(['protected', 'exposed'].includes(verdict), 'macOS result depends on the capture API in use');
    } else {
      // No supported mechanism: the app must say so rather than claim protection.
      assert.equal(verdict, 'exposed');
      assert.match(await win.locator('[data-testid=privacy-result]').innerText(), /no supported capture-exclusion mechanism/);
    }
  });

  test('Privacy Mode persists, and can be switched off again', async () => {
    const userData = ctx.userData;
    await ctx.close();
    ctx = await launch({ userData });
    assert.notEqual(await ctx.win.locator('[data-testid=privacy-pill]').getAttribute('data-state'), 'off', 'still on after restart, applied before the window is shown');
    if (process.platform !== 'linux') assert.equal(await isProtected(ctx), true);

    if (canPressGlobalKeys()) pressCtrlAlt('p');
    else await ctx.win.click('[data-testid=privacy-pill]');
    await ctx.win.waitForSelector('[data-testid=privacy-pill][data-state=off]');
    assert.equal(await isProtected(ctx), false);
    await ctx.win.click('[data-testid=nav-settings]');
    assert.equal(await selfTest(ctx), 'visible-as-expected');
  });
});
