import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.join(__dirname, '..', '..');

export const PATHS = {
  preloadMain: path.join(root, 'out', 'preload', 'index.js'),
  preloadOverlay: path.join(root, 'out', 'preload', 'overlay.js'),
  rendererDir: path.join(root, 'out', 'renderer'),
  rendererIndex: path.join(root, 'out', 'renderer', 'index.html'),
  rendererOverlay: path.join(root, 'out', 'renderer', 'overlay.html'),
  icon: path.join(root, 'resources', 'icon.png'),
  trayIcon: path.join(root, 'resources', 'tray.png'),
} as const;

const rendererOrigin = pathToFileURL(PATHS.rendererDir + path.sep).href;

/** True only for pages shipped inside the app's own renderer directory. */
export function isAppUrl(url: string): boolean {
  return url.startsWith(rendererOrigin);
}
