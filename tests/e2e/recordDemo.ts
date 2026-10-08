/**
 * Records docs/demo.gif by driving the real app against the local stand-in model server.
 *
 *   npm run demo                                  (needs ffmpeg on PATH)
 *   xvfb-run -a -s "-screen 0 1440x900x24" npm run demo     on Linux without a display
 *
 * Frames are screenshots of the app window taken about ten times a second while the script types,
 * clicks and waits like a user would. Nothing is staged or edited afterwards: the GIF is the
 * captured frames with their real timing. Set UNDERTONE_DEMO_OUT to write somewhere else.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { startFakeProvider } from './fakeProvider';
import { ROOT, closeContextIfDrawer, launch, openContext, sleep } from './helpers';

const OUT = path.resolve(process.env.UNDERTONE_DEMO_OUT ?? path.join(ROOT, 'docs', 'demo.gif'));
const FRAME_INTERVAL_MS = 100;
const GIF_WIDTH = 960;
const BACKDROP = '0x0b0d12';

interface Frame {
  file: string;
  at: number;
  width: number;
  height: number;
}

/** Takes window screenshots in the background and keeps only the frames that changed. */
class Recorder {
  readonly frames: Frame[] = [];
  private running = false;
  private loop: Promise<void> = Promise.resolve();
  private lastHash = '';
  private endedAt = 0;

  constructor(
    private readonly win: Page,
    private readonly dir: string,
  ) {}

  start(): void {
    this.running = true;
    this.loop = (async () => {
      while (this.running) {
        const at = Date.now();
        const png = await this.win.screenshot({ type: 'png' }).catch(() => null);
        if (png) {
          const hash = createHash('sha1').update(png).digest('hex');
          if (hash !== this.lastHash) {
            this.lastHash = hash;
            const file = path.join(this.dir, `frame-${String(this.frames.length).padStart(5, '0')}.png`);
            fs.writeFileSync(file, png);
            // PNG stores the image size big-endian in the IHDR chunk, at bytes 16 to 23.
            this.frames.push({ file, at, width: png.readUInt32BE(16), height: png.readUInt32BE(20) });
          }
        }
        await sleep(Math.max(0, FRAME_INTERVAL_MS - (Date.now() - at)));
      }
    })();
  }

  async stop(): Promise<number> {
    this.running = false;
    await this.loop;
    this.endedAt = Date.now();
    return this.endedAt;
  }
}

async function type(win: Page, selector: string, text: string, delay = 20): Promise<void> {
  await win.click(selector);
  await win.locator(selector).pressSequentially(text, { delay });
}

async function waitForReply(win: Page, before: number): Promise<void> {
  await win.locator('[data-testid=msg-assistant]').nth(before).waitFor({ timeout: 15_000 });
  await win.waitForFunction(
    (n) => document.querySelectorAll('[data-testid=msg-assistant][data-streaming=false]').length === n + 1 && !document.querySelector('[data-testid=stop]'),
    before,
    { timeout: 30_000 },
  );
}

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

/** Turns the captured frames into a GIF, holding each frame for as long as it was really on screen. */
function encode(frames: Frame[], endedAt: number, dir: string): void {
  const first = frames[0];
  if (!first) throw new Error('No frames were captured.');
  const list: string[] = ['ffconcat version 1.0'];
  frames.forEach((frame, i) => {
    let file = frame.file;
    if (frame.width !== first.width || frame.height !== first.height) {
      // The compact window is smaller: centre it on a plain backdrop so every frame has one size.
      file = frame.file.replace(/\.png$/, '-fit.png');
      ffmpeg([
        '-i',
        frame.file,
        '-vf',
        `scale=${first.width}:${first.height}:force_original_aspect_ratio=decrease,pad=${first.width}:${first.height}:(ow-iw)/2:(oh-ih)/2:color=${BACKDROP}`,
        file,
      ]);
    }
    const next = frames[i + 1];
    const seconds = Math.max(0.04, ((next ? next.at : endedAt) - frame.at) / 1000);
    list.push(`file '${file.replace(/\\/g, '/')}'`, `duration ${seconds.toFixed(3)}`);
  });
  // The concat demuxer ignores the last duration unless the final file is listed once more.
  const last = frames[frames.length - 1] ?? first;
  list.push(`file '${(last.width !== first.width || last.height !== first.height ? last.file.replace(/\.png$/, '-fit.png') : last.file).replace(/\\/g, '/')}'`);
  const listFile = path.join(dir, 'frames.txt');
  fs.writeFileSync(listFile, `${list.join('\n')}\n`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  ffmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-vf',
    `fps=10,scale=${GIF_WIDTH}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    '-loop',
    '0',
    OUT,
  ]);
}

async function main(): Promise<void> {
  const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'undertone-demo-'));
  const provider = await startFakeProvider({ pieceDelayMs: 28 });
  const ctx = await launch();
  const { win } = ctx;
  try {
    // Set-up, not recorded: point the app at the local stand-in server.
    await win.click('[data-testid=nav-settings]');
    await win.getByRole('radio', { name: 'OpenAI-compatible' }).click();
    await win.fill('[data-testid=base-url]', provider.url);
    await win.press('[data-testid=base-url]', 'Enter');
    await win.fill('[data-testid=api-key]', 'sk-local-test-key-0001');
    await win.click('[data-testid=save-key]');
    await win.waitForFunction(() => (document.querySelector('[data-testid=api-key]') as HTMLInputElement).value === '');
    await win.fill('[data-testid=model]', 'local-large');
    await win.press('[data-testid=model]', 'Enter');
    await win.waitForFunction(() => /local-large/.test(document.querySelector('[data-testid=provider-chip]')?.textContent ?? ''));
    await win.click('[data-testid=nav-assistant]');
    await win.click('[data-testid=new-chat]');
    await sleep(5000); // let the "saved" toasts clear

    const recorder = new Recorder(win, frameDir);
    recorder.start();
    await sleep(900);

    // 1. Give it context once, then ask.
    await openContext(win);
    await type(win, '[data-testid=ctx-topic]', 'Q3 roadmap review with the platform team');
    await type(win, '[data-testid=ctx-role]', 'Product lead presenting to engineering leadership');
    await win.fill('[data-testid=ctx-notes]', 'Last quarter: 9 of 11 commitments shipped. Two enterprise renewals depend on billing.');
    await sleep(900);
    await closeContextIfDrawer(win);
    const before = await win.locator('[data-testid=msg-assistant]').count();
    await type(win, '[data-testid=composer]', 'How should I open the meeting?', 28);
    await sleep(300);
    await win.click('[data-testid=send]');
    await waitForReply(win, before);
    await sleep(2200);

    // 2. Meeting mode: a running transcript becomes a summary, action items and answers.
    await win.click('[data-testid=nav-meeting]');
    await sleep(500);
    await win.click('[data-testid=start-meeting]');
    const lines: Array<[string, string]> = [
      ['Ana', 'Beta is on track for Friday if the cold-start crash is fixed.'],
      ['Ravi', 'Fix is in review, I will land it by Thursday.'],
      ['Mei', 'Two enterprise renewals depend on billing, can we pull the migration ahead of search?'],
      ['Ana', 'Agreed. Search relevance moves to next quarter.'],
    ];
    for (const [speaker, line] of lines) {
      await win.fill('[data-testid=speaker]', speaker);
      await type(win, '[data-testid=line-input]', line, 9);
      await win.press('[data-testid=line-input]', 'Enter');
      await sleep(250);
    }
    for (const kind of ['summary', 'actionItems']) {
      await win.click(`[data-testid=run-${kind}]`);
      await win.locator(`[data-testid=output-${kind}]`).scrollIntoViewIfNeeded();
      await win.waitForSelector(`[data-testid=output-${kind}][data-running=false] .md`, { timeout: 30_000 });
      await win.locator(`[data-testid=output-${kind}]`).scrollIntoViewIfNeeded();
      await sleep(1600);
    }
    await win.locator('[data-testid=meeting-question]').scrollIntoViewIfNeeded();
    await type(win, '[data-testid=meeting-question]', 'When do we ship?', 28);
    await win.press('[data-testid=meeting-question]', 'Enter');
    await win.waitForFunction(() => /Friday\. The beta ships then/.test(document.querySelector('[data-testid=qa-list]')?.textContent ?? ''), undefined, { timeout: 30_000 });
    await win.locator('[data-testid=qa-list]').scrollIntoViewIfNeeded();
    await sleep(2200);
    await win.click('[data-testid=stop-meeting]');
    await sleep(600);

    // 3. Compact floating mode.
    await win.click('[data-testid=nav-assistant]');
    await sleep(500);
    await win.click('[data-testid=toggle-compact]');
    await win.waitForFunction(() => window.innerWidth < 500);
    await sleep(2600);
    await win.click('[data-testid=toggle-compact]');
    await win.waitForFunction(() => window.innerWidth > 800);
    await sleep(1500);

    const endedAt = await recorder.stop();
    encode(recorder.frames, endedAt, frameDir);
    const first = recorder.frames[0];
    const seconds = first ? ((endedAt - first.at) / 1000).toFixed(1) : '0';
    const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
    console.log(`Recorded ${recorder.frames.length} distinct frames over ${seconds}s`);
    console.log(`  gif: ${path.relative(ROOT, OUT)} (${mb} MB)`);
  } finally {
    await ctx.close();
    await provider.close();
    fs.rmSync(ctx.userData, { recursive: true, force: true });
    fs.rmSync(frameDir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
