import fs from 'node:fs';
import path from 'node:path';

/** Minimal .env reader for development. Existing environment variables always win. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

export function loadDotEnv(dir: string, env: NodeJS.ProcessEnv = process.env): void {
  try {
    const parsed = parseEnv(fs.readFileSync(path.join(dir, '.env'), 'utf8'));
    for (const [k, v] of Object.entries(parsed)) if (env[k] === undefined) env[k] = v;
  } catch {
    /* no .env file is fine */
  }
}
