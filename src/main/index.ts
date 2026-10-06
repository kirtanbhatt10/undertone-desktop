import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type IpcMainInvokeEvent, Menu, app, ipcMain, nativeTheme, net, safeStorage, session, shell } from 'electron';
import { type ZodType, ZodError, z } from 'zod';
import { APP_NAME } from '../shared/defaults';
import { IPC } from '../shared/ipc';
import { buildSystemPrompt } from '../shared/prompt';
import type {
  AiEvent,
  AppCommand,
  AppState,
  Conversation,
  ConversationMeta,
  MeetingMeta,
  MeetingSession,
  Settings,
  ShortcutStatus,
} from '../shared/types';
import { effectiveProviderId, resolveProvider } from './ai';
import { MockProvider } from './ai/mock';
import { AnthropicProvider } from './ai/anthropic';
import { OpenAiProvider } from './ai/openai';
import { AiError, type FetchLike, toAiError } from './ai/types';
import { finishCapture, overlayImageDataUrl, overlayWebContentsId, startRegionCapture } from './capture';
import { loadDotEnv } from './env';
import { log } from './logger';
import { PATHS, isAppUrl } from './paths';
import { applyPrivacy, capability, runSelfTest, verifyAffinity } from './privacy';
import {
  aiRequestSchema,
  apiKeySchema,
  contextSchema,
  conversationSchema,
  idSchema,
  meetingSchema,
  overlayRectSchema,
  providerSchema,
  realProviderSchema,
  settingsPatchSchema,
  transcribeSchema,
} from './schemas';
import { type ShortcutHandlers, registerShortcuts, unregisterShortcuts } from './shortcuts';
import { Collection } from './store/collection';
import { SecretStore } from './store/secrets';
import { SettingsStore } from './store/settings';
import { AppTray } from './tray';
import { MainWindow } from './windows';

// ---------------------------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------------------------

if (!app.isPackaged) loadDotEnv(process.cwd());

// Lets tests and portable installs keep data somewhere other than the OS profile directory.
const customData = process.env.UNDERTONE_USER_DATA?.trim();
if (customData && path.isAbsolute(customData)) app.setPath('userData', customData);

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('app.undertone.desktop');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const dataDir = path.join(app.getPath('userData'), 'data');
const logDir = path.join(app.getPath('userData'), 'logs');
log.init(logDir);

process.on('uncaughtException', (err) => log.error('main', 'Uncaught exception', err));
process.on('unhandledRejection', (err) => log.error('main', 'Unhandled rejection', err));

const settingsStore = new SettingsStore(dataDir);
const secrets = new SecretStore(dataDir, safeStorage);
const conversations = new Collection<Conversation>(path.join(dataDir, 'conversations'), conversationSchema as ZodType<Conversation>);
const meetings = new Collection<MeetingSession>(path.join(dataDir, 'meetings'), meetingSchema as ZodType<MeetingSession>);

let main: MainWindow | null = null;
let tray: AppTray | null = null;
let shortcutStatus: ShortcutStatus[] = [];
let quitting = false;
const inFlight = new Map<string, AbortController>();

/** Chromium's network stack: honours the system proxy and certificate store. */
const netFetch: FetchLike = (url, init) => net.fetch(url, init as RequestInit);

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

function buildState(): AppState {
  const settings = settingsStore.get();
  return {
    info: {
      name: APP_NAME,
      version: app.getVersion(),
      platform: process.platform,
      osRelease: os.release(),
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      isPackaged: app.isPackaged,
      dataPath: app.getPath('userData'),
      logPath: log.path,
    },
    settings,
    context: settingsStore.getContext(),
    keyStatus: secrets.status(),
    privacy: { enabled: settings.privacyMode, capability: capability() },
    shortcuts: shortcutStatus,
    effectiveProvider: effectiveProviderId(settings, secrets),
  };
}

function send(channel: string, payload: unknown): void {
  const wc = main?.win.webContents;
  if (wc && !wc.isDestroyed()) wc.send(channel, payload);
}

const pushState = (): void => send(IPC.evState, buildState());
const command = (cmd: AppCommand): void => send(IPC.evCommand, cmd);

/** Applies every side effect of a settings change. Called once at startup with `prev = null`. */
function applySettings(prev: Settings | null, next: Settings): void {
  if (!main) return;
  if (!prev || prev.privacyMode !== next.privacyMode) {
    applyPrivacy(main.win, next.privacyMode);
    log.info('privacy', `Privacy Mode ${next.privacyMode ? 'enabled' : 'disabled'} (${capability().level})`);
  }
  if (!prev || prev.compact !== next.compact || prev.alwaysOnTop !== next.alwaysOnTop) main.setCompact(next.compact, next.alwaysOnTop);
  if (!prev || prev.theme !== next.theme) nativeTheme.themeSource = next.theme;
  if (!prev || JSON.stringify(prev.shortcuts) !== JSON.stringify(next.shortcuts)) shortcutStatus = registerShortcuts(next.shortcuts, shortcutHandlers);
  if ((!prev || prev.launchAtLogin !== next.launchAtLogin) && app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin')) {
    // A normal, user-controlled login item. It is visible in the OS startup settings and removed when switched off.
    app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, args: next.startMinimized ? ['--hidden'] : [] });
  }
  tray?.refresh();
}

function updateSettings(patch: z.infer<typeof settingsPatchSchema>): Settings {
  const prev = settingsStore.get();
  const next = settingsStore.update(patch);
  applySettings(prev, next);
  pushState();
  return next;
}

/** Single entry point for changing Privacy Mode, so every route gives the same honest feedback. */
function setPrivacyMode(enabled: boolean): void {
  const next = updateSettings({ privacyMode: enabled });
  const cap = capability();
  command({
    type: 'toast',
    level: next.privacyMode && cap.level !== 'full' ? 'warn' : 'info',
    message: next.privacyMode
      ? cap.level === 'full'
        ? 'Privacy Mode on — hidden from supported screen capture'
        : cap.level === 'partial'
          ? 'Privacy Mode on — protection is partial on this system'
          : 'Privacy Mode on — but this system cannot hide the window from capture'
      : 'Privacy Mode off — this window is visible to screen capture',
  });
}

const togglePrivacy = (): void => setPrivacyMode(!settingsStore.get().privacyMode);

async function capture(): Promise<void> {
  if (!main) return;
  try {
    const settings = settingsStore.get();
    const attachment = await startRegionCapture({ mainWindow: main.win, hideMain: settings.hideOnCapture, privacy: settings.privacyMode });
    if (attachment) {
      main.show();
      command({ type: 'capture-result', attachment });
    }
  } catch (err) {
    log.error('capture', 'Capture failed', err);
    command({ type: 'capture-error', message: err instanceof Error ? err.message : 'Screen capture failed.' });
  }
}

const shortcutHandlers: ShortcutHandlers = {
  toggleWindow: () => main?.toggle(),
  togglePrivacy,
  ask: () => {
    main?.show();
    command({ type: 'focus-composer' });
  },
  capture: () => void capture(),
  toggleMeeting: () => {
    main?.show();
    command({ type: 'toggle-meeting' });
  },
  toggleCompact: () => {
    updateSettings({ compact: !settingsStore.get().compact });
    main?.show();
  },
};

// ---------------------------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------------------------

function trusted(event: IpcMainInvokeEvent, kind: 'main' | 'overlay'): boolean {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame || !isAppUrl(frame.url)) return false;
  if (kind === 'overlay') return event.sender.id === overlayWebContentsId();
  return !!main && event.sender.id === main.win.webContents.id;
}

function describe(err: unknown): string {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return issue ? `${issue.path.join('.') || 'input'}: ${issue.message}` : 'Invalid input';
  }
  return err instanceof Error ? err.message : 'Unexpected error';
}

/** Every handler checks who is calling and validates its argument before doing anything. */
function handle<S extends ZodType | null, R>(
  channel: string,
  schema: S,
  fn: (arg: S extends ZodType ? z.infer<S> : undefined, event: IpcMainInvokeEvent) => R | Promise<R>,
  kind: 'main' | 'overlay' = 'main',
): void {
  ipcMain.handle(channel, async (event, raw: unknown) => {
    if (!trusted(event, kind)) {
      log.warn('ipc', `Rejected ${channel} from untrusted sender`);
      throw new Error('Forbidden');
    }
    try {
      const arg = schema ? schema.parse(raw) : undefined;
      return await fn(arg as never, event);
    } catch (err) {
      if (!(err instanceof ZodError) && !(err instanceof AiError)) log.error('ipc', `${channel} failed`, err);
      throw new Error(describe(err));
    }
  });
}

function conversationMeta(c: Conversation): ConversationMeta {
  const last = [...c.messages].reverse().find((m) => m.content.trim());
  return { id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, messageCount: c.messages.length, preview: (last?.content ?? '').replace(/\s+/g, ' ').slice(0, 140) };
}

function meetingMeta(m: MeetingSession): MeetingMeta {
  return { id: m.id, title: m.title, startedAt: m.startedAt, endedAt: m.endedAt, preview: (m.outputs.summary || m.notes || m.transcript).replace(/\s+/g, ' ').slice(0, 140) };
}

async function runAi(req: z.infer<typeof aiRequestSchema>): Promise<void> {
  const settings = settingsStore.get();
  const { provider, model, fallback } = resolveProvider(settings, secrets, netFetch);
  const controller = new AbortController();
  inFlight.set(req.requestId, controller);
  const emit = (ev: AiEvent): void => send(IPC.evAi, ev);
  const started = Date.now();
  try {
    emit({ requestId: req.requestId, type: 'start', provider: provider.id, model });
    const system = buildSystemPrompt({ context: settingsStore.getContext(), style: settings.responseStyle, mode: req.mode, meeting: req.meeting });
    await provider.stream(
      { model, system, messages: req.messages, maxTokens: settings.maxTokens, temperature: settings.temperature, signal: controller.signal },
      (text) => emit({ requestId: req.requestId, type: 'delta', text }),
    );
    emit({ requestId: req.requestId, type: 'done', provider: provider.id });
    // Metadata only: prompts and replies are never logged.
    log.info('ai', 'Completed', { provider: provider.id, model, fallback, ms: Date.now() - started, messages: req.messages.length });
  } catch (err) {
    const aiErr = controller.signal.aborted ? new AiError('aborted', 'Stopped.') : toAiError(err, provider.label);
    if (aiErr.code !== 'aborted') log.warn('ai', `Failed: ${aiErr.code}`, { provider: provider.id, model, message: aiErr.message });
    emit({ requestId: req.requestId, type: 'error', code: aiErr.code, message: aiErr.message });
  } finally {
    inFlight.delete(req.requestId);
  }
}

function registerIpc(): void {
  handle(IPC.appGetState, null, () => buildState());
  handle(IPC.appQuit, null, () => {
    quitting = true;
    app.quit();
  });
  handle(IPC.appOpenExternal, z.string().max(2000), async (raw) => {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'mailto:') throw new Error('Only https and mailto links can be opened');
    await shell.openExternal(url.toString());
  });
  handle(IPC.appOpenDataFolder, null, async () => {
    await shell.openPath(app.getPath('userData'));
  });
  handle(IPC.appResetData, null, () => {
    for (const c of inFlight.values()) c.abort();
    conversations.clear();
    meetings.clear();
    secrets.reset();
    const prev = settingsStore.get();
    settingsStore.reset();
    main?.resetState();
    applySettings(prev, settingsStore.get());
    log.info('data', 'Application data reset');
    return buildState();
  });

  handle(IPC.settingsUpdate, settingsPatchSchema, (patch) => {
    updateSettings(patch);
    return buildState();
  });
  handle(IPC.secretsSetKey, z.object({ provider: realProviderSchema, key: apiKeySchema }).strict(), ({ provider, key }) => {
    secrets.set(provider, key);
    log.info('secrets', `API key updated for ${provider}`);
    pushState();
    return buildState();
  });
  handle(IPC.secretsClearKey, realProviderSchema, (provider) => {
    secrets.clear(provider);
    log.info('secrets', `API key removed for ${provider}`);
    pushState();
    return buildState();
  });
  handle(IPC.contextSet, contextSchema, (ctx) => settingsStore.setContext(ctx));

  handle(IPC.historyList, null, () =>
    conversations
      .list()
      .map(conversationMeta)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );
  handle(IPC.historyGet, idSchema, (id) => conversations.get(id));
  handle(IPC.historySave, conversationSchema, (c) => conversationMeta(conversations.save(c as Conversation)));
  handle(IPC.historyDelete, idSchema, (id) => conversations.delete(id));
  handle(IPC.historyClear, null, () => {
    conversations.clear();
    meetings.clear();
    log.info('data', 'History cleared');
  });

  handle(IPC.meetingsList, null, () =>
    meetings
      .list()
      .map(meetingMeta)
      .sort((a, b) => b.startedAt - a.startedAt),
  );
  handle(IPC.meetingsGet, idSchema, (id) => meetings.get(id));
  handle(IPC.meetingsSave, meetingSchema, (m) => meetingMeta(meetings.save(m as MeetingSession)));
  handle(IPC.meetingsDelete, idSchema, (id) => meetings.delete(id));

  handle(IPC.aiStart, aiRequestSchema, (req) => {
    if (inFlight.has(req.requestId)) throw new Error('Duplicate request');
    if (inFlight.size >= 8) throw new Error('Too many requests in progress');
    void runAi(req);
  });
  handle(IPC.aiCancel, idSchema, (id) => inFlight.get(id)?.abort());
  handle(IPC.aiListModels, providerSchema, async (id) => {
    const settings = settingsStore.get();
    const signal = AbortSignal.timeout(15_000);
    if (id === 'mock') return new MockProvider().listModels();
    const key = secrets.get(id);
    if (!key) throw new AiError('no_key', 'Add an API key first.');
    const provider = id === 'anthropic' ? new AnthropicProvider(key, netFetch) : new OpenAiProvider(key, settings.openaiBaseUrl, netFetch);
    return provider.listModels(signal);
  });
  handle(IPC.aiTranscribe, transcribeSchema, async ({ audio, mimeType }) => {
    const settings = settingsStore.get();
    const { provider } = resolveProvider(settings, secrets, netFetch);
    if (!provider.transcribe) throw new AiError('bad_request', `${provider.label} does not offer transcription here. Switch the provider to OpenAI (or a compatible endpoint) to use the microphone.`);
    return provider.transcribe(audio, mimeType, settings.transcriptionModel, AbortSignal.timeout(90_000));
  });

  handle(IPC.privacySet, z.boolean(), (enabled) => {
    setPrivacyMode(enabled);
    return buildState();
  });
  handle(IPC.privacyVerify, null, () => {
    if (!main) throw new Error('Window unavailable');
    return verifyAffinity(main.win, settingsStore.get().privacyMode);
  });
  handle(IPC.privacySelfTest, null, () => {
    if (!main) throw new Error('Window unavailable');
    return runSelfTest(main.win, settingsStore.get().privacyMode, (show) => command({ type: 'privacy-probe', show }));
  });

  handle(IPC.captureStart, null, () => void capture());
  handle(IPC.windowMinimize, null, () => main?.win.minimize());
  handle(IPC.windowHide, null, () => main?.win.hide());

  handle(IPC.overlayInit, null, () => overlayImageDataUrl(), 'overlay');
  handle(IPC.overlayDone, overlayRectSchema, (rect) => finishCapture(rect), 'overlay');
  handle(IPC.overlayCancel, null, () => finishCapture(null), 'overlay');
}

// ---------------------------------------------------------------------------------------------
// Hardening
// ---------------------------------------------------------------------------------------------

function harden(): void {
  // The renderer may write to the clipboard (Copy buttons) and use the microphone (meeting dictation). Nothing else.
  const allow = (wcId: number | undefined, permission: string, mediaTypes?: readonly string[]): boolean => {
    if (!main || wcId !== main.win.webContents.id) return false;
    if (permission === 'clipboard-sanitized-write') return true;
    return permission === 'media' && !(mediaTypes ?? []).includes('video');
  };
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? (details.mediaTypes as string[] | undefined) : undefined;
    callback(allow(wc?.id, permission, mediaTypes));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, _origin, details) => allow(wc?.id, permission, details.mediaType ? [details.mediaType] : []));

  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}

// ---------------------------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------------------------

async function start(): Promise<void> {
  harden();
  registerIpc();
  // The default menu's accelerators (reload, close, zoom, DevTools) are a development convenience only.
  // macOS keeps it because standard editing shortcuts depend on the menu there.
  if (app.isPackaged && process.platform !== 'darwin') Menu.setApplicationMenu(null);
  const settings = settingsStore.get();
  fs.mkdirSync(dataDir, { recursive: true });

  main = new MainWindow(dataDir, { compact: settings.compact, alwaysOnTop: settings.alwaysOnTop, devTools: !app.isPackaged });
  main.win.on('close', (event) => {
    // Closing the window keeps Undertone available from the tray and its shortcuts.
    if (!quitting && tray) {
      event.preventDefault();
      main?.win.hide();
    }
  });
  main.win.webContents.on('render-process-gone', (_e, details) => log.error('renderer', 'Renderer process gone', { reason: details.reason }));

  tray = new AppTray({
    toggleWindow: () => main?.toggle(),
    togglePrivacy,
    capture: () => void capture(),
    quit: () => {
      quitting = true;
      app.quit();
    },
    isPrivacyOn: () => settingsStore.get().privacyMode,
  });

  // Protection is applied before the window is ever shown.
  applySettings(null, settings);
  await main.win.loadFile(PATHS.rendererIndex);

  const hidden = process.argv.includes('--hidden') || (settings.startMinimized && app.getLoginItemSettings().wasOpenedAtLogin);
  if (!hidden) main.show();
  log.info('main', `${APP_NAME} ${app.getVersion()} started`, { platform: process.platform, release: os.release(), electron: process.versions.electron, privacy: capability().level });
}

if (gotLock) {
  app.on('second-instance', () => main?.show());
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', () => {
    unregisterShortcuts();
    tray?.destroy();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => main?.show());
  void app.whenReady().then(start).catch((err) => {
    log.error('main', 'Startup failed', err);
    app.quit();
  });
}

