/** Types shared by the main process, the preload bridge and the renderer. */

export type ProviderId = 'anthropic' | 'openai' | 'mock';
export const PROVIDER_IDS: readonly ProviderId[] = ['anthropic', 'openai', 'mock'];

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResponseStyle = 'concise' | 'balanced' | 'detailed';

export type ShortcutAction =
  | 'toggleWindow'
  | 'togglePrivacy'
  | 'ask'
  | 'capture'
  | 'toggleMeeting'
  | 'toggleCompact';

export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = [
  'toggleWindow',
  'togglePrivacy',
  'ask',
  'capture',
  'toggleMeeting',
  'toggleCompact',
];

export interface Settings {
  provider: ProviderId;
  /** Model identifier per provider. Free text so new models work without an app update. */
  models: Record<ProviderId, string>;
  /** Base URL for OpenAI-compatible endpoints. */
  openaiBaseUrl: string;
  transcriptionModel: string;
  /** null = let the provider use its default. */
  temperature: number | null;
  maxTokens: number;
  responseStyle: ResponseStyle;
  translateLanguage: string;
  theme: ThemeMode;
  privacyMode: boolean;
  alwaysOnTop: boolean;
  compact: boolean;
  launchAtLogin: boolean;
  startMinimized: boolean;
  /** Hide the assistant window while the user selects a screen region. */
  hideOnCapture: boolean;
  shortcuts: Record<ShortcutAction, string>;
}

export interface ContextData {
  enabled: boolean;
  topic: string;
  role: string;
  questions: string;
  notes: string;
  documents: string;
  instructions: string;
}

export interface Attachment {
  id: string;
  kind: 'image';
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  /** Base64 payload without the data: prefix. */
  data: string;
  name?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  /** Label of the quick action that produced this message, if any. */
  action?: string;
  error?: string;
  /** True when the reply came from the offline mock provider. */
  mock?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

export type MeetingOutputKind = 'summary' | 'actionItems' | 'decisions' | 'followUps' | 'questions';

export interface MeetingQA {
  id: string;
  question: string;
  answer: string;
  createdAt: number;
}

export interface MeetingSession {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number | null;
  transcript: string;
  notes: string;
  outputs: Partial<Record<MeetingOutputKind, string>>;
  qa: MeetingQA[];
}

export interface MeetingMeta {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number | null;
  preview: string;
}

export type KeySource = 'stored' | 'session' | 'env' | 'none';

export interface KeyStatus {
  anthropic: KeySource;
  openai: KeySource;
  /** False when the OS has no secure storage; keys are then kept in memory only. */
  encryptionAvailable: boolean;
}

export type PrivacyLevel = 'full' | 'partial' | 'unsupported';

export interface PrivacyCapability {
  level: PrivacyLevel;
  /** Name of the OS mechanism used. */
  mechanism: string;
  detail: string;
}

export interface PrivacyState {
  enabled: boolean;
  capability: PrivacyCapability;
}

export interface PrivacyAffinityCheck {
  supported: boolean;
  /** Raw value reported by the OS (Windows: GetWindowDisplayAffinity). */
  affinity: number | null;
  label: string;
  ok: boolean;
}

export interface PrivacySelfTest {
  /** Whether Privacy Mode was on when the probe ran. */
  privacyEnabled: boolean;
  /** Share of probe-coloured pixels found inside the window's bounds in the capture (0–1). */
  visibleFraction: number;
  visibleInCapture: boolean;
  /** pass = behaviour matched what Privacy Mode promises on this OS. */
  verdict: 'protected' | 'exposed' | 'visible-as-expected' | 'inconclusive';
  message: string;
}

export interface ShortcutStatus {
  action: ShortcutAction;
  accelerator: string;
  registered: boolean;
  error?: string;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  osRelease: string;
  electron: string;
  chrome: string;
  isPackaged: boolean;
  dataPath: string;
  logPath: string;
}

export interface AppState {
  info: AppInfo;
  settings: Settings;
  context: ContextData;
  keyStatus: KeyStatus;
  privacy: PrivacyState;
  shortcuts: ShortcutStatus[];
  /** The provider that will actually answer (falls back to mock when no key is configured). */
  effectiveProvider: ProviderId;
}

export interface AiChatRequest {
  requestId: string;
  messages: Array<Pick<ChatMessage, 'role' | 'content' | 'attachments'>>;
  /** Extra system guidance for a specific workflow (meeting tools, quick actions). */
  mode?: 'chat' | 'meeting';
  meeting?: { title: string; transcript: string; notes: string };
}

export type AiEvent =
  | { requestId: string; type: 'start'; provider: ProviderId; model: string }
  | { requestId: string; type: 'delta'; text: string }
  | { requestId: string; type: 'done'; provider: ProviderId }
  | { requestId: string; type: 'error'; message: string; code: AiErrorCode };

export type AiErrorCode = 'no_key' | 'auth' | 'rate_limit' | 'network' | 'aborted' | 'bad_request' | 'server' | 'unknown';

export type AppCommand =
  | { type: 'focus-composer' }
  | { type: 'toggle-meeting' }
  | { type: 'navigate'; view: ViewId }
  | { type: 'capture-result'; attachment: Attachment }
  | { type: 'capture-error'; message: string }
  | { type: 'privacy-probe'; show: boolean }
  | { type: 'toast'; level: 'info' | 'warn' | 'error'; message: string };

export type ViewId = 'assistant' | 'meeting' | 'history' | 'settings';
