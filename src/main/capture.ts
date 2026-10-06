import { randomUUID } from 'node:crypto';
import { BrowserWindow, type NativeImage, desktopCapturer, screen } from 'electron';
import { LIMITS } from '../shared/defaults';
import type { Attachment } from '../shared/types';
import { log } from './logger';
import { PATHS } from './paths';
import { applyPrivacy } from './privacy';

interface ActiveCapture {
  overlay: BrowserWindow;
  image: NativeImage;
  settle: (result: Attachment | null) => void;
}

let active: ActiveCapture | null = null;

export function overlayWebContentsId(): number | null {
  return active && !active.overlay.isDestroyed() ? active.overlay.webContents.id : null;
}

export function overlayImageDataUrl(): string | null {
  return active ? active.image.toDataURL() : null;
}

const MAX_EDGE = 2000;

/** Crops the captured frame to the selected region and returns it as a PNG attachment. */
export function finishCapture(rect: { x: number; y: number; width: number; height: number } | null): void {
  const current = active;
  if (!current) return;
  active = null;
  let result: Attachment | null = null;
  try {
    if (rect) {
      const size = current.image.getSize();
      const crop = {
        x: Math.min(size.width - 1, Math.max(0, Math.round(rect.x * size.width))),
        y: Math.min(size.height - 1, Math.max(0, Math.round(rect.y * size.height))),
        width: 0,
        height: 0,
      };
      crop.width = Math.max(1, Math.min(size.width - crop.x, Math.round(rect.width * size.width)));
      crop.height = Math.max(1, Math.min(size.height - crop.y, Math.round(rect.height * size.height)));
      let image = current.image.crop(crop);
      const longEdge = Math.max(crop.width, crop.height);
      if (longEdge > MAX_EDGE) {
        image = crop.width >= crop.height ? image.resize({ width: MAX_EDGE, quality: 'best' }) : image.resize({ height: MAX_EDGE, quality: 'best' });
      }
      let data = image.toPNG().toString('base64');
      let mediaType: Attachment['mediaType'] = 'image/png';
      if (data.length > LIMITS.attachmentBase64Chars) {
        data = image.toJPEG(82).toString('base64');
        mediaType = 'image/jpeg';
      }
      if (data.length <= LIMITS.attachmentBase64Chars) {
        result = { id: randomUUID(), kind: 'image', mediaType, data, name: `Screen capture ${new Date().toLocaleTimeString()}` };
      }
    }
  } catch (err) {
    log.error('capture', 'Failed to crop capture', err);
  } finally {
    if (!current.overlay.isDestroyed()) current.overlay.destroy();
    current.settle(result);
  }
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Takes ONE still frame of the display under the cursor, in response to an explicit user action,
 * and lets the user drag out the region to keep. Nothing is captured in the background.
 */
export async function startRegionCapture(opts: { mainWindow: BrowserWindow; hideMain: boolean; privacy: boolean }): Promise<Attachment | null> {
  if (active) {
    active.overlay.focus();
    return null;
  }
  const { mainWindow } = opts;
  const wasVisible = mainWindow.isVisible() && !mainWindow.isMinimized();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

  if (opts.hideMain && wasVisible) {
    mainWindow.hide();
    await wait(220);
  }

  try {
    const scale = display.scaleFactor || 1;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) },
    });
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new Error('The operating system did not return a screen image. Screen-recording permission may be required.');

    const overlay = new BrowserWindow({
      ...display.bounds,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      backgroundColor: '#000000',
      title: 'Undertone capture',
      webPreferences: { preload: PATHS.preloadOverlay, contextIsolation: true, sandbox: true, nodeIntegration: false, devTools: false },
    });
    overlay.setAlwaysOnTop(true, 'screen-saver');
    applyPrivacy(overlay, opts.privacy);

    const result = new Promise<Attachment | null>((resolve) => {
      active = { overlay, image: source.thumbnail, settle: resolve };
    });
    overlay.on('closed', () => {
      if (active?.overlay === overlay) {
        const settle = active.settle;
        active = null;
        settle(null);
      }
    });
    let shownAt = Number.POSITIVE_INFINITY;
    overlay.on('blur', () => {
      // Clicking away cancels, but ignore the focus shuffle that can happen right as the overlay appears.
      if (active?.overlay === overlay && Date.now() - shownAt > 500) finishCapture(null);
    });
    await overlay.loadFile(PATHS.rendererOverlay);
    overlay.setBounds(display.bounds);
    overlay.show();
    overlay.focus();
    shownAt = Date.now();
    return await result;
  } finally {
    if (opts.hideMain && wasVisible && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }
}
