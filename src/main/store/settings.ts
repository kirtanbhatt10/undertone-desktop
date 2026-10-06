import path from 'node:path';
import { DEFAULT_SETTINGS, EMPTY_CONTEXT } from '../../shared/defaults';
import type { ContextData, Settings } from '../../shared/types';
import { contextSchema, settingsSchema } from '../schemas';
import { readJson, writeJsonAtomic } from './jsonFile';
import fs from 'node:fs';

type SettingsPatch = Partial<Omit<Settings, 'models' | 'shortcuts'>> & {
  models?: Partial<Settings['models']>;
  shortcuts?: Partial<Settings['shortcuts']>;
};

export function mergeSettings(base: Settings, patch: SettingsPatch): Settings {
  return {
    ...base,
    ...patch,
    models: { ...base.models, ...(patch.models ?? {}) },
    shortcuts: { ...base.shortcuts, ...(patch.shortcuts ?? {}) },
  } as Settings;
}

/** Reads settings from disk, falling back field-by-field to defaults when the file is missing or damaged. */
export function loadSettings(file: string): Settings {
  const raw = readJson(file);
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_SETTINGS);
  const full = settingsSchema.safeParse(mergeSettings(DEFAULT_SETTINGS, raw as SettingsPatch));
  if (full.success) return full.data;
  // Keep every valid top-level field; drop only the broken ones.
  const result: Record<string, unknown> = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(key in settingsSchema.shape)) continue;
    const candidate = mergeSettings(result as unknown as Settings, { [key]: value } as SettingsPatch);
    const ok = settingsSchema.safeParse(candidate);
    if (ok.success) Object.assign(result, ok.data);
  }
  return result as unknown as Settings;
}

export class SettingsStore {
  private settings: Settings;
  private context: ContextData;
  private readonly settingsFile: string;
  private readonly contextFile: string;

  constructor(dir: string) {
    this.settingsFile = path.join(dir, 'settings.json');
    this.contextFile = path.join(dir, 'context.json');
    this.settings = loadSettings(this.settingsFile);
    const ctx = contextSchema.safeParse(readJson(this.contextFile));
    this.context = ctx.success ? ctx.data : { ...EMPTY_CONTEXT };
  }

  get(): Settings {
    return this.settings;
  }

  update(patch: SettingsPatch): Settings {
    this.settings = settingsSchema.parse(mergeSettings(this.settings, patch));
    writeJsonAtomic(this.settingsFile, this.settings);
    return this.settings;
  }

  getContext(): ContextData {
    return this.context;
  }

  setContext(next: ContextData): ContextData {
    this.context = contextSchema.parse(next);
    writeJsonAtomic(this.contextFile, this.context);
    return this.context;
  }

  reset(): void {
    fs.rmSync(this.settingsFile, { force: true });
    fs.rmSync(this.contextFile, { force: true });
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.context = { ...EMPTY_CONTEXT };
  }
}
