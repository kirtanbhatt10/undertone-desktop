import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { UndertoneApi } from './api';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: unknown, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

// Each method maps to exactly one fixed channel; the renderer cannot choose channel names.
const api: UndertoneApi = {
  getState: () => ipcRenderer.invoke(IPC.appGetState),
  quit: () => ipcRenderer.invoke(IPC.appQuit),
  openExternal: (url) => ipcRenderer.invoke(IPC.appOpenExternal, url),
  openDataFolder: () => ipcRenderer.invoke(IPC.appOpenDataFolder),
  resetData: () => ipcRenderer.invoke(IPC.appResetData),

  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  setApiKey: (provider, key) => ipcRenderer.invoke(IPC.secretsSetKey, { provider, key }),
  clearApiKey: (provider) => ipcRenderer.invoke(IPC.secretsClearKey, provider),
  setContext: (context) => ipcRenderer.invoke(IPC.contextSet, context),

  listConversations: () => ipcRenderer.invoke(IPC.historyList),
  getConversation: (id) => ipcRenderer.invoke(IPC.historyGet, id),
  saveConversation: (conversation) => ipcRenderer.invoke(IPC.historySave, conversation),
  deleteConversation: (id) => ipcRenderer.invoke(IPC.historyDelete, id),
  clearHistory: () => ipcRenderer.invoke(IPC.historyClear),

  listMeetings: () => ipcRenderer.invoke(IPC.meetingsList),
  getMeeting: (id) => ipcRenderer.invoke(IPC.meetingsGet, id),
  saveMeeting: (meeting) => ipcRenderer.invoke(IPC.meetingsSave, meeting),
  deleteMeeting: (id) => ipcRenderer.invoke(IPC.meetingsDelete, id),

  startAi: (request) => ipcRenderer.invoke(IPC.aiStart, request),
  cancelAi: (requestId) => ipcRenderer.invoke(IPC.aiCancel, requestId),
  listModels: (provider) => ipcRenderer.invoke(IPC.aiListModels, provider),
  transcribe: (audio, mimeType) => ipcRenderer.invoke(IPC.aiTranscribe, { audio, mimeType }),

  setPrivacy: (enabled) => ipcRenderer.invoke(IPC.privacySet, enabled),
  verifyPrivacy: () => ipcRenderer.invoke(IPC.privacyVerify),
  privacySelfTest: () => ipcRenderer.invoke(IPC.privacySelfTest),

  startCapture: () => ipcRenderer.invoke(IPC.captureStart),
  minimize: () => ipcRenderer.invoke(IPC.windowMinimize),
  hide: () => ipcRenderer.invoke(IPC.windowHide),

  onState: (listener) => subscribe(IPC.evState, listener),
  onAiEvent: (listener) => subscribe(IPC.evAi, listener),
  onCommand: (listener) => subscribe(IPC.evCommand, listener),
};

contextBridge.exposeInMainWorld('undertone', api);
