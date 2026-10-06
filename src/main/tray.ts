import { Menu, Tray, nativeImage } from 'electron';
import { APP_NAME } from '../shared/defaults';
import { log } from './logger';
import { PATHS } from './paths';

export interface TrayActions {
  toggleWindow(): void;
  togglePrivacy(): void;
  capture(): void;
  quit(): void;
  isPrivacyOn(): boolean;
}

export class AppTray {
  private tray: Tray | null = null;

  constructor(private readonly actions: TrayActions) {
    try {
      const icon = nativeImage.createFromPath(PATHS.trayIcon);
      this.tray = new Tray(icon);
      this.tray.setToolTip(APP_NAME);
      this.tray.on('click', () => actions.toggleWindow());
      this.refresh();
    } catch (err) {
      // Some Linux desktops have no tray; the app works without one.
      log.warn('tray', 'Tray unavailable', err);
    }
  }

  refresh(): void {
    if (!this.tray) return;
    this.tray.setToolTip(`${APP_NAME}${this.actions.isPrivacyOn() ? ' — Privacy Mode on' : ''}`);
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Show / hide ${APP_NAME}`, click: () => this.actions.toggleWindow() },
        { label: 'Privacy Mode', type: 'checkbox', checked: this.actions.isPrivacyOn(), click: () => this.actions.togglePrivacy() },
        { label: 'Capture screen region…', click: () => this.actions.capture() },
        { type: 'separator' },
        { label: `Quit ${APP_NAME}`, click: () => this.actions.quit() },
      ]),
    );
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
