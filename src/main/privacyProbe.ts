import type { PrivacyCapability, PrivacySelfTest } from '../shared/types';

/** Works out which OS mechanism backs Privacy Mode on this machine. Pure, so it can be unit-tested. */
export function getPrivacyCapability(platform: string, osRelease: string): PrivacyCapability {
  if (platform === 'win32') {
    const build = Number(osRelease.split('.')[2] ?? 0);
    if (build >= 19041) {
      return {
        level: 'full',
        mechanism: 'SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)',
        detail:
          'Windows leaves this window out of screen captures composed by the Desktop Window Manager — the path behind Windows Graphics Capture, Desktop Duplication (DXGI) and GDI screen copies, and so behind typical screen sharing, Snipping Tool, Print Screen and display capture in recording tools.',
      };
    }
    return {
      level: 'partial',
      mechanism: 'SetWindowDisplayAffinity(WDA_MONITOR)',
      detail:
        'This version of Windows (older than Windows 10 version 2004, build 19041) cannot exclude a window from capture. The window content is replaced by a black rectangle instead, so viewers can tell a window is there.',
    };
  }
  if (platform === 'darwin') {
    return {
      level: 'partial',
      mechanism: 'NSWindow.sharingType = .none',
      detail:
        'macOS hides the window from legacy capture APIs. Apps that capture with ScreenCaptureKit (the default on macOS 15 and later) may still include it, so protection cannot be guaranteed on current macOS.',
    };
  }
  return {
    level: 'unsupported',
    mechanism: 'none',
    detail: 'This operating system offers no supported way to exclude a window from screen capture. Privacy Mode can be switched on, but it will not hide the window.',
  };
}

export const PROBE_COLOR = { r: 255, g: 0, b: 255 } as const;

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Counts how much of `rect` in a BGRA bitmap is the probe colour.
 * Returns a 0–1 fraction of sampled pixels.
 */
export function probeFraction(bitmap: Uint8Array, size: { width: number; height: number }, rect: PixelRect): number {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(size.width, Math.floor(rect.x + rect.width));
  const y1 = Math.min(size.height, Math.floor(rect.y + rect.height));
  if (x1 <= x0 || y1 <= y0) return 0;
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 60));
  let total = 0;
  let hits = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * size.width + x) * 4;
      const b = bitmap[i] ?? 0;
      const g = bitmap[i + 1] ?? 0;
      const r = bitmap[i + 2] ?? 0;
      total++;
      if (r > 215 && b > 215 && g < 60) hits++;
    }
  }
  return total ? hits / total : 0;
}

export function judgeProbe(privacyEnabled: boolean, fraction: number, capability: PrivacyCapability): PrivacySelfTest {
  const visibleInCapture = fraction >= 0.02;
  const base = { privacyEnabled, visibleFraction: fraction, visibleInCapture };
  if (privacyEnabled && !visibleInCapture) {
    return { ...base, verdict: 'protected', message: 'Protected: the window did not appear in a screen capture taken through the OS capture API.' };
  }
  if (privacyEnabled) {
    return {
      ...base,
      verdict: 'exposed',
      message:
        capability.level === 'unsupported'
          ? 'Exposed: the window is visible in screen captures. This operating system has no supported capture-exclusion mechanism.'
          : `Exposed: the window still appeared in a screen capture even though ${capability.mechanism} is set. Do not rely on Privacy Mode on this machine.`,
    };
  }
  if (fraction >= 0.5) {
    return { ...base, verdict: 'visible-as-expected', message: 'Privacy Mode is off and the window is visible in screen captures, as expected. Turn Privacy Mode on and run the test again.' };
  }
  return { ...base, verdict: 'inconclusive', message: 'Inconclusive: the window was not found in the capture. Make sure it is fully on screen and not covered by another window, then try again.' };
}
