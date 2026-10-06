/** IPC channel names. Every channel is listed here so the preload allow-list and main handlers stay in sync. */
export const IPC = {
  appGetState: 'app:get-state',
  appQuit: 'app:quit',
  appOpenExternal: 'app:open-external',
  appOpenDataFolder: 'app:open-data-folder',
  appResetData: 'app:reset-data',

  settingsUpdate: 'settings:update',
  secretsSetKey: 'secrets:set-key',
  secretsClearKey: 'secrets:clear-key',
  contextSet: 'context:set',

  historyList: 'history:list',
  historyGet: 'history:get',
  historySave: 'history:save',
  historyDelete: 'history:delete',
  historyClear: 'history:clear',

  meetingsList: 'meetings:list',
  meetingsGet: 'meetings:get',
  meetingsSave: 'meetings:save',
  meetingsDelete: 'meetings:delete',

  aiStart: 'ai:start',
  aiCancel: 'ai:cancel',
  aiListModels: 'ai:list-models',
  aiTranscribe: 'ai:transcribe',

  privacySet: 'privacy:set',
  privacyVerify: 'privacy:verify',
  privacySelfTest: 'privacy:self-test',

  captureStart: 'capture:start',

  windowMinimize: 'window:minimize',
  windowHide: 'window:hide',

  // main -> renderer
  evState: 'event:state',
  evAi: 'event:ai',
  evCommand: 'event:command',

  // capture overlay window
  overlayInit: 'overlay:init',
  overlayDone: 'overlay:done',
  overlayCancel: 'overlay:cancel',
} as const;
