import fs from 'node:fs';
import path from 'node:path';
import type { KeySource, KeyStatus } from '../../shared/types';
import { log } from '../logger';
import { readJson, writeJsonAtomic } from './jsonFile';

export type RealProvider = 'anthropic' | 'openai';

/** The slice of Electron's safeStorage we rely on; injected so the store can be unit-tested. */
export interface Encryptor {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

const ENV_VARS: Record<RealProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

/**
 * API keys live only in the main process.
 * - With OS secure storage (DPAPI / Keychain / libsecret) they are encrypted at rest.
 * - Without it they are held in memory for the session and never written to disk.
 * - Environment variables are a read-only fallback.
 */
export class SecretStore {
  private readonly file: string;
  private readonly session = new Map<RealProvider, string>();

  constructor(
    dir: string,
    private readonly encryptor: Encryptor,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {
    this.file = path.join(dir, 'secrets.json');
  }

  private available(): boolean {
    try {
      return this.encryptor.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  private readStored(): Partial<Record<RealProvider, string>> {
    const raw = readJson(this.file);
    return raw && typeof raw === 'object' ? (raw as Partial<Record<RealProvider, string>>) : {};
  }

  private storedKey(provider: RealProvider): string | null {
    const blob = this.readStored()[provider];
    if (typeof blob !== 'string' || !this.available()) return null;
    try {
      return this.encryptor.decryptString(Buffer.from(blob, 'base64'));
    } catch (err) {
      log.warn('secrets', `Stored ${provider} key could not be decrypted`, err);
      return null;
    }
  }

  source(provider: RealProvider): KeySource {
    if (this.storedKey(provider)) return 'stored';
    if (this.session.has(provider)) return 'session';
    if (this.env[ENV_VARS[provider]]?.trim()) return 'env';
    return 'none';
  }

  /** Returns the key for use in a request. Never send the result to the renderer or the log. */
  get(provider: RealProvider): string | null {
    return this.storedKey(provider) ?? this.session.get(provider) ?? this.env[ENV_VARS[provider]]?.trim() ?? null;
  }

  set(provider: RealProvider, key: string): void {
    if (this.available()) {
      const stored = this.readStored();
      stored[provider] = this.encryptor.encryptString(key).toString('base64');
      writeJsonAtomic(this.file, stored);
      this.session.delete(provider);
    } else {
      this.session.set(provider, key);
    }
  }

  clear(provider: RealProvider): void {
    this.session.delete(provider);
    const stored = this.readStored();
    if (provider in stored) {
      delete stored[provider];
      writeJsonAtomic(this.file, stored);
    }
  }

  reset(): void {
    this.session.clear();
    fs.rmSync(this.file, { force: true });
  }

  status(): KeyStatus {
    return { anthropic: this.source('anthropic'), openai: this.source('openai'), encryptionAvailable: this.available() };
  }
}
