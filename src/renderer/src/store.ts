import { useSyncExternalStore } from 'react';
import { MEETING_ANSWER_INSTRUCTION, MEETING_TOOLS, type QuickAction, buildQuickActionPrompt } from '../../shared/actions';
import { LIMITS } from '../../shared/defaults';
import { titleFromText } from '../../shared/prompt';
import type {
  AiChatRequest,
  AiEvent,
  AppState,
  Attachment,
  ChatMessage,
  ContextData,
  Conversation,
  ConversationMeta,
  MeetingMeta,
  MeetingOutputKind,
  MeetingSession,
  ProviderId,
  ViewId,
} from '../../shared/types';
import type { SettingsPatch } from '../../preload/api';
import { api, errorMessage, uid } from './lib/api';
import { clock } from './lib/format';

export interface Toast {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface UiState {
  app: AppState | null;
  view: ViewId;
  contextOpen: boolean;
  conversations: ConversationMeta[];
  meetings: MeetingMeta[];
  conversation: Conversation;
  streaming: { requestId: string; messageId: string } | null;
  draft: string;
  attachments: Attachment[];
  meeting: MeetingSession | null;
  /** Meeting tools that are currently generating, keyed by tool kind or "qa". */
  meetingBusy: Record<string, string>;
  toasts: Toast[];
  probe: boolean;
  focusTick: number;
}

function blankConversation(): Conversation {
  const now = Date.now();
  return { id: uid(), title: 'New conversation', createdAt: now, updatedAt: now, messages: [] };
}

let state: UiState = {
  app: null,
  view: 'assistant',
  contextOpen: true,
  conversations: [],
  meetings: [],
  conversation: blankConversation(),
  streaming: null,
  draft: '',
  attachments: [],
  meeting: null,
  meetingBusy: {},
  toasts: [],
  probe: false,
  focusTick: 0,
};

const listeners = new Set<() => void>();

export function getState(): UiState {
  return state;
}

function set(patch: Partial<UiState> | ((s: UiState) => Partial<UiState>)): void {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore<T>(selector: (s: UiState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ------------------------------------------------------------------------------------------------
// Toasts
// ------------------------------------------------------------------------------------------------

export function toast(message: string, level: Toast['level'] = 'info'): void {
  const id = uid();
  set((s) => ({ toasts: [...s.toasts.slice(-3), { id, level, message }] }));
  window.setTimeout(() => dismissToast(id), level === 'error' ? 7000 : 3600);
}

export function dismissToast(id: string): void {
  set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    toast(errorMessage(err), 'error');
    return undefined;
  }
}

// ------------------------------------------------------------------------------------------------
// AI streaming plumbing
// ------------------------------------------------------------------------------------------------

interface StreamHandlers {
  onStart?: (provider: ProviderId) => void;
  onDelta: (text: string) => void;
  resolve: () => void;
  reject: (err: Error) => void;
}

const streams = new Map<string, StreamHandlers>();

function handleAiEvent(ev: AiEvent): void {
  const h = streams.get(ev.requestId);
  if (!h) return;
  if (ev.type === 'start') h.onStart?.(ev.provider);
  else if (ev.type === 'delta') h.onDelta(ev.text);
  else if (ev.type === 'done') {
    streams.delete(ev.requestId);
    h.resolve();
  } else {
    streams.delete(ev.requestId);
    const err = new Error(ev.message);
    err.name = ev.code;
    h.reject(err);
  }
}

function stream(request: Omit<AiChatRequest, 'requestId'>, requestId: string, onDelta: (text: string) => void, onStart?: (p: ProviderId) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    streams.set(requestId, { onDelta, onStart, resolve, reject });
    api.startAi({ ...request, requestId }).catch((err: unknown) => {
      streams.delete(requestId);
      reject(new Error(errorMessage(err)));
    });
  });
}

// ------------------------------------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------------------------------------

export async function boot(): Promise<void> {
  api.onState((app) => {
    // The context panel would cover the whole compact window, so it follows the layout.
    const was = state.app?.settings.compact;
    set(was !== undefined && was !== app.settings.compact ? { app, contextOpen: !app.settings.compact } : { app });
  });
  api.onAiEvent(handleAiEvent);
  api.onCommand((cmd) => {
    switch (cmd.type) {
      case 'focus-composer':
        set((s) => ({ view: 'assistant', focusTick: s.focusTick + 1 }));
        break;
      case 'toggle-meeting':
        set({ view: 'meeting' });
        void (state.meeting && state.meeting.endedAt === null ? stopMeeting() : startMeeting());
        break;
      case 'navigate':
        set({ view: cmd.view });
        break;
      case 'capture-result':
        addAttachment(cmd.attachment);
        set((s) => ({ view: 'assistant', focusTick: s.focusTick + 1 }));
        break;
      case 'capture-error':
        toast(cmd.message, 'error');
        break;
      case 'privacy-probe':
        set({ probe: cmd.show });
        break;
      case 'toast':
        toast(cmd.message, cmd.level);
        break;
    }
  });
  const app = await api.getState();
  set({ app, contextOpen: !app.settings.compact });
  await Promise.all([refreshConversations(), refreshMeetings()]);
}

export async function refreshConversations(): Promise<void> {
  const conversations = await guard(() => api.listConversations());
  if (conversations) set({ conversations });
}

export async function refreshMeetings(): Promise<void> {
  const meetings = await guard(() => api.listMeetings());
  if (meetings) set({ meetings });
}

// ------------------------------------------------------------------------------------------------
// Navigation and settings
// ------------------------------------------------------------------------------------------------

export function navigate(view: ViewId): void {
  set({ view });
}

export function toggleContext(open?: boolean): void {
  set((s) => ({ contextOpen: open ?? !s.contextOpen }));
}

export async function updateSettings(patch: SettingsPatch): Promise<boolean> {
  const app = await guard(() => api.updateSettings(patch));
  if (app) set(patch.compact !== undefined ? { app, contextOpen: !app.settings.compact } : { app });
  return !!app;
}

export async function setPrivacy(enabled: boolean): Promise<void> {
  const app = await guard(() => api.setPrivacy(enabled));
  if (app) set({ app });
}

export async function setApiKey(provider: 'anthropic' | 'openai', key: string): Promise<boolean> {
  const app = await guard(() => api.setApiKey(provider, key));
  if (app) {
    set({ app });
    toast(app.keyStatus.encryptionAvailable ? 'API key saved to secure storage' : 'API key kept in memory for this session only');
  }
  return !!app;
}

export async function clearApiKey(provider: 'anthropic' | 'openai'): Promise<void> {
  const app = await guard(() => api.clearApiKey(provider));
  if (app) set({ app });
}

let contextTimer: number | undefined;
export function setContext(patch: Partial<ContextData>): void {
  if (!state.app) return;
  const context = { ...state.app.context, ...patch };
  set({ app: { ...state.app, context } });
  window.clearTimeout(contextTimer);
  contextTimer = window.setTimeout(() => void guard(() => api.setContext(context)), 350);
}

// ------------------------------------------------------------------------------------------------
// Conversation
// ------------------------------------------------------------------------------------------------

export function setDraft(draft: string): void {
  set({ draft });
}

export function addAttachment(attachment: Attachment): void {
  if (state.attachments.length >= LIMITS.attachmentsPerMessage) {
    toast(`You can attach up to ${LIMITS.attachmentsPerMessage} images per message.`, 'warn');
    return;
  }
  set((s) => ({ attachments: [...s.attachments, attachment] }));
}

export function removeAttachment(id: string): void {
  set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) }));
}

function patchMessage(id: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)): void {
  set((s) => ({
    conversation: {
      ...s.conversation,
      messages: s.conversation.messages.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)),
    },
  }));
}

async function persistConversation(): Promise<void> {
  const conversation = { ...state.conversation, updatedAt: Date.now() };
  if (conversation.messages.length === 0) return;
  set({ conversation });
  await guard(() => api.saveConversation(conversation));
  await refreshConversations();
}

async function generateReply(): Promise<void> {
  const history = state.conversation.messages
    .filter((m) => !(m.role === 'assistant' && (!m.content.trim() || m.error)))
    .map((m) => ({ role: m.role, content: m.content, ...(m.attachments?.length ? { attachments: m.attachments } : {}) }));
  const reply: ChatMessage = { id: uid(), role: 'assistant', content: '', createdAt: Date.now() };
  const requestId = uid();
  set((s) => ({
    conversation: { ...s.conversation, messages: [...s.conversation.messages, reply] },
    streaming: { requestId, messageId: reply.id },
  }));
  try {
    await stream(
      { messages: history, mode: 'chat' },
      requestId,
      (text) => patchMessage(reply.id, (m) => ({ content: m.content + text })),
      (provider) => patchMessage(reply.id, { mock: provider === 'mock' }),
    );
  } catch (err) {
    const e = err as Error;
    if (e.name !== 'aborted') patchMessage(reply.id, { error: e.message });
    else if (!state.conversation.messages.find((m) => m.id === reply.id)?.content) {
      set((s) => ({ conversation: { ...s.conversation, messages: s.conversation.messages.filter((m) => m.id !== reply.id) } }));
    }
  } finally {
    set({ streaming: null });
    await persistConversation();
  }
}

export async function sendMessage(content: string, opts: { action?: string } = {}): Promise<void> {
  const text = content.trim();
  if (state.streaming) return;
  if (!text && state.attachments.length === 0) return;
  if (text.length > LIMITS.messageChars) {
    toast('That message is too long. Shorten it or move reference material into Context → Documents.', 'warn');
    return;
  }
  const message: ChatMessage = {
    id: uid(),
    role: 'user',
    content: text,
    createdAt: Date.now(),
    ...(state.attachments.length ? { attachments: state.attachments } : {}),
    ...(opts.action ? { action: opts.action } : {}),
  };
  set((s) => ({
    view: 'assistant',
    draft: '',
    attachments: [],
    conversation: {
      ...s.conversation,
      title: s.conversation.messages.length === 0 ? (opts.action ? `${opts.action}: ` : '') + titleFromText(text.replace(/^[^\n]*\n\n"""\n/, ''), 'Image question') : s.conversation.title,
      messages: [...s.conversation.messages, message],
    },
  }));
  await generateReply();
}

/** Runs a quick action on the draft, falling back to the last reply, then to the context documents. */
export async function runQuickAction(action: QuickAction): Promise<void> {
  if (state.streaming || !state.app) return;
  const lastReply = [...state.conversation.messages].reverse().find((m) => m.role === 'assistant' && m.content.trim() && !m.error);
  const ctx = state.app.context;
  const source = state.draft.trim() || lastReply?.content.trim() || (ctx.enabled ? ctx.documents.trim() || ctx.notes.trim() : '');
  if (!source && state.attachments.length === 0) {
    toast('Type or paste some text first — quick actions work on your draft, the last reply, or your context documents.', 'warn');
    return;
  }
  const prompt = source ? buildQuickActionPrompt(action, source, state.app.settings.translateLanguage) : action.instruction({ language: state.app.settings.translateLanguage });
  await sendMessage(prompt, { action: action.label });
}

export async function regenerate(): Promise<void> {
  if (state.streaming) return;
  const messages = [...state.conversation.messages];
  while (messages.length && messages[messages.length - 1]?.role === 'assistant') messages.pop();
  if (!messages.length) return;
  set((s) => ({ conversation: { ...s.conversation, messages } }));
  await generateReply();
}

export function stopStreaming(): void {
  if (state.streaming) void api.cancelAi(state.streaming.requestId);
}

export function newConversation(): void {
  stopStreaming();
  set((s) => ({ conversation: blankConversation(), draft: '', attachments: [], view: 'assistant', focusTick: s.focusTick + 1 }));
}

export async function clearConversation(): Promise<void> {
  stopStreaming();
  const id = state.conversation.id;
  const hadMessages = state.conversation.messages.length > 0;
  set({ conversation: blankConversation(), attachments: [] });
  if (hadMessages) {
    await guard(() => api.deleteConversation(id));
    await refreshConversations();
    toast('Conversation cleared');
  }
}

export async function openConversation(id: string): Promise<void> {
  if (state.streaming) stopStreaming();
  const conversation = await guard(() => api.getConversation(id));
  if (conversation) set({ conversation, view: 'assistant', draft: '', attachments: [] });
  else if (conversation === null) toast('That conversation could not be opened.', 'error');
}

export async function deleteConversation(id: string): Promise<void> {
  await guard(() => api.deleteConversation(id));
  if (state.conversation.id === id) set({ conversation: blankConversation() });
  await refreshConversations();
}

export async function clearAllHistory(): Promise<void> {
  stopStreaming();
  await guard(() => api.clearHistory());
  set({ conversation: blankConversation(), meeting: null, conversations: [], meetings: [] });
  toast('All local history deleted');
}

export async function resetAllData(): Promise<void> {
  stopStreaming();
  const app = await guard(() => api.resetData());
  if (app) {
    set({ app, conversation: blankConversation(), meeting: null, conversations: [], meetings: [], draft: '', attachments: [], view: 'assistant' });
    toast('Undertone has been reset');
  }
}

// ------------------------------------------------------------------------------------------------
// Meetings
// ------------------------------------------------------------------------------------------------

let meetingTimer: number | undefined;

function saveMeetingSoon(delay = 500): void {
  window.clearTimeout(meetingTimer);
  meetingTimer = window.setTimeout(() => void saveMeetingNow(), delay);
}

async function saveMeetingNow(): Promise<void> {
  window.clearTimeout(meetingTimer);
  const meeting = state.meeting;
  if (!meeting) return;
  await guard(() => api.saveMeeting(meeting));
  await refreshMeetings();
}

export async function startMeeting(): Promise<void> {
  const topic = state.app?.context.enabled ? state.app.context.topic.trim() : '';
  const now = Date.now();
  const meeting: MeetingSession = {
    id: uid(),
    title: topic ? topic.slice(0, 120) : `Meeting · ${new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${clock(now)}`,
    startedAt: now,
    endedAt: null,
    transcript: '',
    notes: '',
    outputs: {},
    qa: [],
  };
  set({ meeting, view: 'meeting', meetingBusy: {} });
  await saveMeetingNow();
  toast('Meeting session started');
}

export async function stopMeeting(): Promise<void> {
  if (!state.meeting || state.meeting.endedAt !== null) return;
  set((s) => ({ meeting: s.meeting ? { ...s.meeting, endedAt: Date.now() } : null }));
  await saveMeetingNow();
  toast('Meeting session ended and saved to History');
}

export function patchMeeting(patch: Partial<MeetingSession>): void {
  if (!state.meeting) return;
  set((s) => ({ meeting: s.meeting ? { ...s.meeting, ...patch } : null }));
  saveMeetingSoon();
}

export function appendTranscript(text: string, speaker = ''): void {
  const line = text.trim();
  if (!state.meeting || !line) return;
  const prefix = `[${clock(Date.now())}] ${speaker.trim() ? `${speaker.trim()}: ` : ''}`;
  const current = state.meeting.transcript;
  patchMeeting({ transcript: `${current}${current && !current.endsWith('\n') ? '\n' : ''}${prefix}${line}\n`.slice(-LIMITS.transcriptChars) });
}

function meetingPayload(m: MeetingSession): AiChatRequest['meeting'] {
  return { title: m.title, transcript: m.transcript, notes: m.notes };
}

export async function runMeetingTool(kind: MeetingOutputKind): Promise<void> {
  const meeting = state.meeting;
  const tool = MEETING_TOOLS.find((t) => t.kind === kind);
  if (!meeting || !tool || state.meetingBusy[kind]) return;
  if (!meeting.transcript.trim() && !meeting.notes.trim()) {
    toast('Add some transcript or notes first.', 'warn');
    return;
  }
  const requestId = uid();
  set((s) => ({ meetingBusy: { ...s.meetingBusy, [kind]: requestId }, meeting: s.meeting ? { ...s.meeting, outputs: { ...s.meeting.outputs, [kind]: '' } } : null }));
  try {
    await stream({ messages: [{ role: 'user', content: tool.instruction }], mode: 'meeting', meeting: meetingPayload(meeting) }, requestId, (text) =>
      set((s) => (s.meeting?.id === meeting.id ? { meeting: { ...s.meeting, outputs: { ...s.meeting.outputs, [kind]: (s.meeting.outputs[kind] ?? '') + text } } } : {})),
    );
  } catch (err) {
    if ((err as Error).name !== 'aborted') toast((err as Error).message, 'error');
  } finally {
    set((s) => {
      const { [kind]: _done, ...rest } = s.meetingBusy;
      return { meetingBusy: rest };
    });
    await saveMeetingNow();
  }
}

export async function askMeeting(question: string): Promise<void> {
  const meeting = state.meeting;
  const q = question.trim();
  if (!meeting || !q || state.meetingBusy.qa) return;
  const requestId = uid();
  const entry = { id: uid(), question: q, answer: '', createdAt: Date.now() };
  set((s) => ({ meetingBusy: { ...s.meetingBusy, qa: requestId }, meeting: s.meeting ? { ...s.meeting, qa: [entry, ...s.meeting.qa] } : null }));
  const update = (fn: (answer: string) => string): void =>
    set((s) => (s.meeting?.id === meeting.id ? { meeting: { ...s.meeting, qa: s.meeting.qa.map((x) => (x.id === entry.id ? { ...x, answer: fn(x.answer) } : x)) } } : {}));
  try {
    await stream({ messages: [{ role: 'user', content: `${MEETING_ANSWER_INSTRUCTION}\n\nQuestion: ${q}` }], mode: 'meeting', meeting: meetingPayload(meeting) }, requestId, (text) => update((a) => a + text));
  } catch (err) {
    if ((err as Error).name !== 'aborted') update(() => `⚠️ ${(err as Error).message}`);
  } finally {
    set((s) => {
      const { qa: _done, ...rest } = s.meetingBusy;
      return { meetingBusy: rest };
    });
    await saveMeetingNow();
  }
}

export function cancelMeetingTool(key: string): void {
  const id = state.meetingBusy[key];
  if (id) void api.cancelAi(id);
}

export async function openMeeting(id: string): Promise<void> {
  if (state.meeting && state.meeting.endedAt === null && state.meeting.id !== id) await stopMeeting();
  const meeting = await guard(() => api.getMeeting(id));
  if (meeting) set({ meeting, view: 'meeting', meetingBusy: {} });
}

export async function deleteMeeting(id: string): Promise<void> {
  await guard(() => api.deleteMeeting(id));
  if (state.meeting?.id === id) set({ meeting: null });
  await refreshMeetings();
}

export function closeMeeting(): void {
  set({ meeting: null, meetingBusy: {} });
}
