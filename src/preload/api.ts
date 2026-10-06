import type {
  AiChatRequest,
  AiEvent,
  AppCommand,
  AppState,
  ContextData,
  Conversation,
  ConversationMeta,
  MeetingMeta,
  MeetingSession,
  PrivacyAffinityCheck,
  PrivacySelfTest,
  ProviderId,
  Settings,
} from '../shared/types';

export type SettingsPatch = Partial<Omit<Settings, 'models' | 'shortcuts'>> & {
  models?: Partial<Settings['models']>;
  shortcuts?: Partial<Settings['shortcuts']>;
};

/** The complete surface the renderer can reach. There is no generic `invoke` and no Node access. */
export interface UndertoneApi {
  getState(): Promise<AppState>;
  quit(): Promise<void>;
  openExternal(url: string): Promise<void>;
  openDataFolder(): Promise<void>;
  resetData(): Promise<AppState>;

  updateSettings(patch: SettingsPatch): Promise<AppState>;
  setApiKey(provider: 'anthropic' | 'openai', key: string): Promise<AppState>;
  clearApiKey(provider: 'anthropic' | 'openai'): Promise<AppState>;
  setContext(context: ContextData): Promise<ContextData>;

  listConversations(): Promise<ConversationMeta[]>;
  getConversation(id: string): Promise<Conversation | null>;
  saveConversation(conversation: Conversation): Promise<ConversationMeta>;
  deleteConversation(id: string): Promise<void>;
  clearHistory(): Promise<void>;

  listMeetings(): Promise<MeetingMeta[]>;
  getMeeting(id: string): Promise<MeetingSession | null>;
  saveMeeting(meeting: MeetingSession): Promise<MeetingMeta>;
  deleteMeeting(id: string): Promise<void>;

  startAi(request: AiChatRequest): Promise<void>;
  cancelAi(requestId: string): Promise<void>;
  listModels(provider: ProviderId): Promise<string[]>;
  transcribe(audio: Uint8Array, mimeType: string): Promise<string>;

  setPrivacy(enabled: boolean): Promise<AppState>;
  verifyPrivacy(): Promise<PrivacyAffinityCheck>;
  privacySelfTest(): Promise<PrivacySelfTest>;

  startCapture(): Promise<void>;
  minimize(): Promise<void>;
  hide(): Promise<void>;

  onState(listener: (state: AppState) => void): () => void;
  onAiEvent(listener: (event: AiEvent) => void): () => void;
  onCommand(listener: (command: AppCommand) => void): () => void;
}

export interface OverlayApi {
  getImage(): Promise<string | null>;
  done(rect: { x: number; y: number; width: number; height: number }): Promise<void>;
  cancel(): Promise<void>;
}
