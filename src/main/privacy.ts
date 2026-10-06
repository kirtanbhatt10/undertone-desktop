import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { type BrowserWindow, desktopCapturer, screen } from 'electron';
import type { PrivacyAffinityCheck, PrivacyCapability, PrivacySelfTest } from '../shared/types';
import { log } from './logger';
import { getPrivacyCapability, judgeProbe, probeFraction } from './privacyProbe';

export function capability(): PrivacyCapability {
  return getPrivacyCapability(process.platform, os.release());
}

/**
 * Applies Privacy Mode through Electron's content-protection API, which maps to the documented
 * OS call on each platform (SetWindowDisplayAffinity on Windows, NSWindow.sharingType on macOS).
 * No hooks, injection or process hiding are involved; the window stays visible to the local user,
 * in the taskbar and in the task manager.
 */
export function applyPrivacy(win: BrowserWindow, enabled: boolean): void {
  if (win.isDestroyed()) return;
  try {
    win.setContentProtection(enabled);
  } catch (err) {
    log.warn('privacy', 'setContentProtection failed', err);
  }
}

const AFFINITY_LABELS: Record<number, string> = {
  0x00: 'WDA_NONE (not protected)',
  0x01: 'WDA_MONITOR (shown as a black rectangle in captures)',
  0x11: 'WDA_EXCLUDEFROMCAPTURE (excluded from captures)',
};

/**
 * Asks Windows what display affinity the window currently has, using GetWindowDisplayAffinity.
 * This reads the real OS state rather than trusting our own flag.
 */
export function verifyAffinity(win: BrowserWindow, expected: boolean): Promise<PrivacyAffinityCheck> {
  if (process.platform !== 'win32') {
    return Promise.resolve({ supported: false, affinity: null, label: 'Reading window display affinity is only available on Windows.', ok: false });
  }
  const handle = win.getNativeWindowHandle();
  const hwnd = handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : String(handle.readUInt32LE(0));
  if (!/^\d+$/.test(hwnd)) return Promise.resolve({ supported: false, affinity: null, label: 'Invalid window handle.', ok: false });

  const script = [
    "$sig = '[DllImport(\"user32.dll\", SetLastError=true)] public static extern bool GetWindowDisplayAffinity(System.IntPtr hWnd, out uint affinity);'",
    "$t = Add-Type -MemberDefinition $sig -Name UndertoneAffinity -Namespace Win32 -PassThru",
    '$a = [uint32]0',
    `if ($t::GetWindowDisplayAffinity([System.IntPtr]::new([long]${hwnd}), [ref]$a)) { Write-Output $a } else { Write-Output 'ERR' }`,
  ].join('; ');
  const exe = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

  return new Promise((resolve) => {
    execFile(exe, ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 15_000, windowsHide: true }, (err, stdout) => {
      const out = String(stdout ?? '').trim();
      if (err || !/^\d+$/.test(out)) {
        log.warn('privacy', 'GetWindowDisplayAffinity query failed', err ?? out);
        resolve({ supported: false, affinity: null, label: 'Could not query the window display affinity.', ok: false });
        return;
      }
      const affinity = Number(out);
      const ok = expected ? affinity === 0x11 || affinity === 0x01 : affinity === 0;
      resolve({ supported: true, affinity, label: AFFINITY_LABELS[affinity] ?? `0x${affinity.toString(16)}`, ok });
    });
  });
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * End-to-end check: paint the window in a probe colour, take one screen capture through the OS
 * capture API, and look for the probe colour where the window is. Runs only when the user asks.
 */
export async function runSelfTest(win: BrowserWindow, privacyEnabled: boolean, showProbe: (show: boolean) => void): Promise<PrivacySelfTest> {
  const cap = capability();
  if (!win.isVisible() || win.isMinimized()) {
    return { privacyEnabled, visibleFraction: 0, visibleInCapture: false, verdict: 'inconclusive', message: 'Show the Undertone window before running the self-test.' };
  }
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  showProbe(true);
  try {
    await wait(450);
    const scale = display.scaleFactor || 1;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) },
    });
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
    if (!source || source.thumbnail.isEmpty()) {
      return { privacyEnabled, visibleFraction: 0, visibleInCapture: false, verdict: 'inconclusive', message: 'The operating system did not return a screen capture, so the test could not run (screen-recording permission may be required).' };
    }
    const size = source.thumbnail.getSize();
    const ratio = size.width / display.bounds.width;
    const inset = 12;
    const fraction = probeFraction(source.thumbnail.toBitmap(), size, {
      x: (bounds.x - display.bounds.x + inset) * ratio,
      y: (bounds.y - display.bounds.y + inset) * ratio,
      width: (bounds.width - inset * 2) * ratio,
      height: (bounds.height - inset * 2) * ratio,
    });
    const result = judgeProbe(privacyEnabled, fraction, cap);
    log.info('privacy', `Self-test: ${result.verdict}`, { fraction: Number(fraction.toFixed(3)), privacyEnabled, level: cap.level });
    return result;
  } catch (err) {
    log.warn('privacy', 'Self-test failed', err);
    return { privacyEnabled, visibleFraction: 0, visibleInCapture: false, verdict: 'inconclusive', message: 'The screen capture failed, so the test could not run.' };
  } finally {
    showProbe(false);
  }
}
