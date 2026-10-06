import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { type ElectronApplication, type Page, _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(import.meta.dirname, '..', '..');

export interface Launched {
  app: ElectronApplication;
  win: Page;
  userData: string;
  close(): Promise<void>;
}

export function tempUserData(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'undertone-e2e-'));
}

/** Launches the built app against an isolated data directory with no API keys in the environment. */
export async function launch(opts: { userData?: string; env?: Record<string, string>; args?: string[] } = {}): Promise<Launched> {
  const userData = opts.userData ?? tempUserData();
  const args = [...(opts.args ?? []), ROOT];
  // Chromium's sandbox cannot start as root inside containers (CI); it stays on everywhere else.
  if (process.platform === 'linux' && process.getuid?.() === 0) args.unshift('--no-sandbox');
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  Object.assign(env, { UNDERTONE_USER_DATA: userData, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', OPENAI_BASE_URL: '', UNDERTONE_MOCK: '' }, opts.env);

  const app = await electron.launch({ executablePath: require('electron') as string, args, env });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid=app]', { timeout: 20_000 });
  return {
    app,
    win,
    userData,
    close: async () => {
      // The window's close button hides to the tray, so quit through the app itself.
      await app.evaluate(({ app: a }) => a.quit()).catch(() => undefined);
      await app.close().catch(() => undefined);
    },
  };
}

export async function mainBounds(app: ElectronApplication): Promise<{ x: number; y: number; width: number; height: number; onTop: boolean; visible: boolean }> {
  return app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Undertone') ?? BrowserWindow.getAllWindows()[0];
    if (!w) throw new Error('no window');
    return { ...w.getBounds(), onTop: w.isAlwaysOnTop(), visible: w.isVisible() };
  });
}

export async function send(win: Page, text: string): Promise<string> {
  const before = await win.locator('[data-testid=msg-assistant]').count();
  await win.fill('[data-testid=composer]', text);
  await win.click('[data-testid=send]');
  const reply = win.locator('[data-testid=msg-assistant]').nth(before);
  await reply.waitFor({ timeout: 15_000 });
  await win.waitForFunction((n) => document.querySelectorAll('[data-testid=msg-assistant][data-streaming=false]').length === n + 1 && !document.querySelector('[data-testid=stop]'), before, { timeout: 30_000 });
  return reply.innerText();
}

/** Makes sure the context panel is showing (it starts closed when the window is narrow). */
export async function openContext(win: Page): Promise<void> {
  if ((await win.locator('[data-testid=context-panel]').count()) === 0) await win.click('[data-testid=toggle-context]');
  await win.waitForSelector('[data-testid=context-panel]');
}

/** On narrow windows the panel is a drawer over the content; close it again so it does not cover what the test clicks next. */
export async function closeContextIfDrawer(win: Page): Promise<void> {
  const drawer = await win.evaluate(() => window.innerWidth < 1100);
  if (drawer && (await win.locator('[data-testid=context-panel]').count()) > 0) {
    await win.click('[data-testid=toggle-context]');
    await win.waitForFunction(() => !document.querySelector('[data-testid=context-panel]'));
  }
}

/** True when real key presses can be injected at the OS level (X11 + XTest). */
export function canPressGlobalKeys(): boolean {
  if (process.platform !== 'linux' || !process.env.DISPLAY) return false;
  const probe = spawnSync('python3', ['-c', 'import ctypes; ctypes.cdll.LoadLibrary("libXtst.so.6")']);
  return probe.status === 0;
}

/** Presses Ctrl+Alt+<key> at the X server, outside the app, the way a user's keyboard would. */
export function pressCtrlAlt(key: string): void {
  execFileSync('python3', [path.join(ROOT, 'tests', 'e2e', 'xkey.py'), 'Control_L', 'Alt_L', key.toLowerCase()]);
}

export async function shot(win: Page, name: string): Promise<void> {
  const dir = process.env.UNDERTONE_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await win.screenshot({ path: path.join(dir, `${name}.png`) });
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
