import { globalShortcut } from 'electron';
import { validateAccelerator } from '../shared/accelerator';
import { SHORTCUT_ACTIONS, type Settings, type ShortcutAction, type ShortcutStatus } from '../shared/types';
import { log } from './logger';

export type ShortcutHandlers = Record<ShortcutAction, () => void>;

/** Registers the configured global shortcuts and reports, per action, whether the OS accepted it. */
export function registerShortcuts(shortcuts: Settings['shortcuts'], handlers: ShortcutHandlers): ShortcutStatus[] {
  globalShortcut.unregisterAll();
  const seen = new Map<string, ShortcutAction>();
  const status: ShortcutStatus[] = [];

  for (const action of SHORTCUT_ACTIONS) {
    const accelerator = shortcuts[action];
    const valid = validateAccelerator(accelerator);
    if (!valid.ok) {
      status.push({ action, accelerator, registered: false, error: valid.reason });
      continue;
    }
    const clash = seen.get(accelerator.toLowerCase());
    if (clash) {
      status.push({ action, accelerator, registered: false, error: 'Already used by another Undertone shortcut' });
      continue;
    }
    seen.set(accelerator.toLowerCase(), action);
    let registered = false;
    try {
      registered = globalShortcut.register(accelerator, () => {
        log.debug('shortcuts', `Triggered ${action}`);
        handlers[action]();
      });
    } catch (err) {
      log.warn('shortcuts', `Failed to register ${action}`, err);
    }
    status.push(registered ? { action, accelerator, registered } : { action, accelerator, registered, error: 'Unavailable — in use by the system or another app' });
  }
  return status;
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll();
}
