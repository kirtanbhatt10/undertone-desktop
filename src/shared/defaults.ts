import type { ContextData, Settings, ShortcutAction } from './types';

export const APP_NAME = 'Undertone';

export const PRIVACY_NOTICE =
  'Privacy Mode protects this window from supported screen-capture APIs. It cannot guarantee invisibility from cameras, external capture devices, or unsupported capture mechanisms.';

export const RECORDING_NOTICE =
  'Recording or transcribing a conversation may require the consent of everyone taking part, depending on local law and on your organisation’s or the meeting’s policies. Only continue if you have that consent.';

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  toggleWindow: 'CommandOrControl+Alt+U',
  togglePrivacy: 'CommandOrControl+Alt+P',
  ask: 'CommandOrControl+Alt+A',
  capture: 'CommandOrControl+Alt+S',
  toggleMeeting: 'CommandOrControl+Alt+M',
  toggleCompact: 'CommandOrControl+Alt+K',
};

export const SHORTCUT_LABELS: Record<ShortcutAction, { title: string; hint: string }> = {
  toggleWindow: { title: 'Open / close assistant', hint: 'Show or hide the Undertone window' },
  togglePrivacy: { title: 'Toggle Privacy Mode', hint: 'Exclude the window from supported screen capture' },
  ask: { title: 'Ask assistant', hint: 'Bring Undertone forward and focus the prompt' },
  capture: { title: 'Capture context', hint: 'Select a screen region to attach' },
  toggleMeeting: { title: 'Start / stop meeting', hint: 'Begin or end a meeting session' },
  toggleCompact: { title: 'Toggle compact mode', hint: 'Switch between floating and full layouts' },
};

/** Suggestions only: the model field is free text and the list can be refreshed from the provider. */
export const MODEL_SUGGESTIONS = {
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  mock: ['undertone-mock'],
} as const;

export const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  models: { anthropic: 'claude-sonnet-4-5', openai: 'gpt-4o-mini', mock: 'undertone-mock' },
  openaiBaseUrl: 'https://api.openai.com/v1',
  transcriptionModel: 'whisper-1',
  temperature: null,
  maxTokens: 2048,
  responseStyle: 'balanced',
  translateLanguage: 'English',
  theme: 'dark',
  privacyMode: false,
  alwaysOnTop: false,
  compact: false,
  launchAtLogin: false,
  startMinimized: false,
  hideOnCapture: true,
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

export const EMPTY_CONTEXT: ContextData = {
  enabled: true,
  topic: '',
  role: '',
  questions: '',
  notes: '',
  documents: '',
  instructions: '',
};

export const LIMITS = {
  messageChars: 200_000,
  contextFieldChars: 20_000,
  documentChars: 200_000,
  transcriptChars: 500_000,
  attachmentsPerMessage: 4,
  /** Base64 characters (~7.5 MB decoded). */
  attachmentBase64Chars: 10_000_000,
  messagesPerConversation: 2_000,
  audioBytes: 24 * 1024 * 1024,
} as const;
