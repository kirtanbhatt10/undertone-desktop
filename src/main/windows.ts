import path from 'node:path';
import { BrowserWindow, screen } from 'electron';
import { z } from 'zod';
import { APP_NAME } from '../shared/defaults';
import { PATHS } from './paths';
import { readJson, writeJsonAtomic } from './store/jsonFile';

const boundsSchema = z.object({ x: z.number().int(), y: z.number().int(), width: z.number().int().min(300), height: z.number().int().min(300) });
const stateSchema = z.object({ full: boundsSchema.optional(), compact: boundsSchema.optional() });
type Bounds = z.infer<typeof boundsSchema>;
type Mode = 'full' | 'compact';

const MIN: Record<Mode, { width: number; height: number }> = {
  full: { width: 900, height: 580 },
  compact: { width: 360, height: 440 },
};

function defaultBounds(mode: Mode): Bounds {
  const area = screen.getPrimaryDisplay().workArea;
  if (mode === 'compact') {
    const width = 420;
    const height = Math.min(660, area.height - 80);
    return { x: area.x + area.width - width - 28, y: area.y + 56, width, height };
  }
  const width = Math.min(1200, Math.max(MIN.full.width, Math.round(area.width * 0.78)));
  const height = Math.min(800, Math.max(MIN.full.height, Math.round(area.height * 0.82)));
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height };
}

/** Keeps a saved position only if it still lands on a connected display. */
function onScreen(b: Bounds): boolean {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + b.width > a.x + 60 && b.x < a.x + a.width - 60 && b.y >= a.y - 10 && b.y < a.y + a.height - 60;
  });
}

export class MainWindow {
  readonly win: BrowserWindow;
  private mode: Mode;
  private readonly stateFile: string;
  private state: z.infer<typeof stateSchema>;

  constructor(dataDir: string, opts: { compact: boolean; alwaysOnTop: boolean; devTools: boolean }) {
    this.stateFile = path.join(dataDir, 'window-state.json');
    const parsed = stateSchema.safeParse(readJson(this.stateFile));
    this.state = parsed.success ? parsed.data : {};
    this.mode = opts.compact ? 'compact' : 'full';

    this.win = new BrowserWindow({
      ...this.boundsFor(this.mode),
      minWidth: MIN[this.mode].width,
      minHeight: MIN[this.mode].height,
      show: false,
      frame: false,
      title: APP_NAME,
      icon: PATHS.icon,
      backgroundColor: '#0d0e12',
      alwaysOnTop: opts.alwaysOnTop || opts.compact,
      webPreferences: {
        preload: PATHS.preloadMain,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        webviewTag: false,
        spellcheck: true,
        devTools: opts.devTools,
      },
    });
    this.win.setMenuBarVisibility(false);

    const remember = (): void => {
      if (this.win.isDestroyed() || this.win.isMinimized() || this.win.isFullScreen()) return;
      this.state[this.mode] = this.win.getNormalBounds();
    };
    this.win.on('resized', remember);
    this.win.on('moved', remember);
    this.win.on('close', () => {
      remember();
      this.persist();
    });
  }

  private boundsFor(mode: Mode): Bounds {
    const saved = this.state[mode];
    return saved && onScreen(saved) ? saved : defaultBounds(mode);
  }

  private persist(): void {
    try {
      writeJsonAtomic(this.stateFile, this.state);
    } catch {
      /* non-critical */
    }
  }

  /** Switches between the full layout and the compact floating layout. */
  setCompact(compact: boolean, alwaysOnTopWhenFull: boolean): void {
    const next: Mode = compact ? 'compact' : 'full';
    if (next !== this.mode) {
      if (!this.win.isMinimized()) this.state[this.mode] = this.win.getNormalBounds();
      this.mode = next;
      // Lower the minimum before shrinking, raise it after growing.
      this.win.setMinimumSize(MIN.compact.width, MIN.compact.height);
      this.win.setBounds(this.boundsFor(next), false);
      this.win.setMinimumSize(MIN[next].width, MIN[next].height);
      this.persist();
    }
    this.setAlwaysOnTop(compact || alwaysOnTopWhenFull);
  }

  setAlwaysOnTop(on: boolean): void {
    this.win.setAlwaysOnTop(on, on ? 'floating' : 'normal');
  }

  show(): void {
    if (this.win.isMinimized()) this.win.restore();
    this.win.show();
    this.win.focus();
  }

  toggle(): void {
    if (this.win.isVisible() && this.win.isFocused() && !this.win.isMinimized()) this.win.hide();
    else this.show();
  }

  resetState(): void {
    this.state = {};
    this.persist();
  }
}
