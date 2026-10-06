import fs from 'node:fs';
import path from 'node:path';

type Level = 'debug' | 'info' | 'warn' | 'error';

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_\-]{8,}/g,
  /sk-[A-Za-z0-9_\-]{16,}/g,
  /(Bearer\s+)[A-Za-z0-9._\-]{8,}/gi,
  /((?:x-api-key|api[_-]?key|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]{6,}/gi,
];

/** Removes anything that looks like a credential before a line is written. */
export function redact(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (_m, prefix?: string) => `${typeof prefix === 'string' ? prefix : ''}[redacted]`);
  }
  return out;
}

const MAX_BYTES = 1_000_000;

class Logger {
  private file: string | null = null;

  init(dir: string): void {
    try {
      fs.mkdirSync(dir, { recursive: true });
      this.file = path.join(dir, 'undertone.log');
      const stat = fs.existsSync(this.file) ? fs.statSync(this.file) : null;
      if (stat && stat.size > MAX_BYTES) fs.renameSync(this.file, `${this.file}.1`);
    } catch {
      this.file = null;
    }
  }

  get path(): string {
    return this.file ?? '';
  }

  private write(level: Level, scope: string, message: string, meta?: unknown): void {
    let extra = '';
    if (meta !== undefined) {
      try {
        extra = ` ${meta instanceof Error ? `${meta.name}: ${meta.message}` : JSON.stringify(meta)}`;
      } catch {
        extra = ' [unserialisable]';
      }
    }
    const line = redact(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${extra}`);
    if (level === 'error' || level === 'warn' || process.env.UNDERTONE_DEBUG) console[level === 'debug' ? 'log' : level](line);
    if (!this.file) return;
    try {
      fs.appendFileSync(this.file, `${line}\n`);
    } catch {
      /* logging must never crash the app */
    }
  }

  debug(scope: string, message: string, meta?: unknown): void {
    if (process.env.UNDERTONE_DEBUG) this.write('debug', scope, message, meta);
  }
  info(scope: string, message: string, meta?: unknown): void {
    this.write('info', scope, message, meta);
  }
  warn(scope: string, message: string, meta?: unknown): void {
    this.write('warn', scope, message, meta);
  }
  error(scope: string, message: string, meta?: unknown): void {
    this.write('error', scope, message, meta);
  }
}

/** Message content, transcripts and keys are never passed to the logger; redaction is a second line of defence. */
export const log = new Logger();
