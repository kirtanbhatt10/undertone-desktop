import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { OverlayApi } from './api';

const api: OverlayApi = {
  getImage: () => ipcRenderer.invoke(IPC.overlayInit),
  done: (rect) => ipcRenderer.invoke(IPC.overlayDone, rect),
  cancel: () => ipcRenderer.invoke(IPC.overlayCancel),
};

contextBridge.exposeInMainWorld('undertoneOverlay', api);
