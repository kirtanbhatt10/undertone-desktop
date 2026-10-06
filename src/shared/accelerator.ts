/** Validation and formatting for Electron accelerator strings. */

const MODIFIERS = new Set(['Command', 'Cmd', 'Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl', 'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta']);

const NAMED_KEYS = new Set([
  'Plus', 'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter', 'Up', 'Down', 'Left', 'Right',
  'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Esc', 'PrintScreen',
]);

function isKey(k: string): boolean {
  if (NAMED_KEYS.has(k)) return true;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) return true;
  return /^[A-Z0-9]$/.test(k) || /^[`\-=\[\]\;',./]$/.test(k);
}

export function validateAccelerator(accel: string): { ok: true } | { ok: false; reason: string } {
  if (typeof accel !== 'string' || accel.length === 0 || accel.length > 64) return { ok: false, reason: 'Shortcut is empty' };
  const parts = accel.split('+');
  const key = parts[parts.length - 1] ?? '';
  const mods = parts.slice(0, -1);
  if (mods.length === 0) return { ok: false, reason: 'Add at least one modifier (Ctrl, Alt, Shift…)' };
  if (!mods.every((m) => MODIFIERS.has(m))) return { ok: false, reason: 'Unknown modifier' };
  if (new Set(mods).size !== mods.length) return { ok: false, reason: 'Duplicate modifier' };
  if (mods.length === 1 && mods[0] === 'Shift' && !/^F\d+$/.test(key)) return { ok: false, reason: 'Shift alone is not enough for a global shortcut' };
  if (!isKey(key)) return { ok: false, reason: 'Unsupported key' };
  return { ok: true };
}

/** Human-readable form, e.g. "Ctrl + Alt + U" or "⌘ ⌥ U". */
export function formatAccelerator(accel: string, platform: string): string {
  const mac = platform === 'darwin';
  const map: Record<string, string> = mac
    ? { CommandOrControl: '⌘', CmdOrCtrl: '⌘', Command: '⌘', Cmd: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Super: '⌘', Meta: '⌘' }
    : { CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Command: 'Win', Cmd: 'Win', Control: 'Ctrl', Ctrl: 'Ctrl', Option: 'Alt', Super: 'Win', Meta: 'Win' };
  return accel
    .split('+')
    .map((p) => map[p] ?? p)
    .join(mac ? ' ' : ' + ');
}

export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Converts a keydown event into an accelerator, or null while only modifiers are held. */
export function acceleratorFromEvent(e: KeyLike, platform: string): string | null {
  const mods: string[] = [];
  const mac = platform === 'darwin';
  if (mac ? e.metaKey : e.ctrlKey) mods.push('CommandOrControl');
  if (mac && e.ctrlKey) mods.push('Control');
  if (!mac && e.metaKey) mods.push('Super');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');

  let key: string | null = null;
  const code = e.code;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
  else {
    const named: Record<string, string> = {
      Space: 'Space', Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home', End: 'End',
      PageUp: 'PageUp', PageDown: 'PageDown', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
      Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    };
    key = named[code] ?? null;
  }
  if (!key) return null;
  return [...mods, key].join('+');
}
