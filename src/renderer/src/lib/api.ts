import type { UndertoneApi } from '../../../preload/api';

declare global {
  interface Window {
    undertone: UndertoneApi;
  }
}

export const api: UndertoneApi = window.undertone;

/** IPC errors arrive wrapped as "Error invoking remote method 'x': Error: message". */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^(Error|AiError):\s*/, '');
}

export function uid(): string {
  return crypto.randomUUID();
}
