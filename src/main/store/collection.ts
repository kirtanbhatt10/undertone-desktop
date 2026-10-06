import fs from 'node:fs';
import path from 'node:path';
import type { ZodType } from 'zod';
import { idSchema } from '../schemas';
import { readJson, writeJsonAtomic } from './jsonFile';

/**
 * A directory of `<uuid>.json` documents. IDs are validated as UUIDs before they touch the
 * filesystem, so a caller can never address a path outside the collection directory.
 */
export class Collection<T extends { id: string }> {
  constructor(
    private readonly dir: string,
    private readonly schema: ZodType<T>,
  ) {}

  private fileFor(id: string): string {
    return path.join(this.dir, `${idSchema.parse(id)}.json`);
  }

  list(): T[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    const out: T[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const parsed = this.schema.safeParse(readJson(path.join(this.dir, name)));
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }

  get(id: string): T | null {
    const parsed = this.schema.safeParse(readJson(this.fileFor(id)));
    return parsed.success ? parsed.data : null;
  }

  save(value: T): T {
    const clean = this.schema.parse(value);
    writeJsonAtomic(this.fileFor(clean.id), clean);
    return clean;
  }

  delete(id: string): void {
    fs.rmSync(this.fileFor(id), { force: true });
  }

  clear(): void {
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
}
