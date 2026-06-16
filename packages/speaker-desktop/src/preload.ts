import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

/**
 * Exposes a safe, typed IPC bridge to renderer processes via window.electronAPI.
 * All channels are explicitly allow-listed — no arbitrary channel access.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ── renderer → main ────────────────────────────────────────────────────
  createEvent: (title: string) =>
    ipcRenderer.invoke('create-event', title),

  startSession: (payload: { eventCode: string; languages: string[] }) =>
    ipcRenderer.invoke('start-session', payload),

  endSession: () =>
    ipcRenderer.invoke('end-session'),

  toggleOverlay: () =>
    ipcRenderer.send('toggle-overlay'),

  closeOverlay: () =>
    ipcRenderer.send('close-overlay'),

  toggleOverlayPosition: () =>
    ipcRenderer.send('toggle-overlay-position'),

  setCaptionLang: (lang: string) =>
    ipcRenderer.send('set-caption-lang', lang),

  sendMicChunk: (buffer: ArrayBuffer) =>
    ipcRenderer.send('mic-chunk', buffer),

  // ── main → renderer ────────────────────────────────────────────────────
  onCaptionUpdate: (cb: (data: { lang: string; text: string; isFinal: boolean }) => void) => {
    ipcRenderer.on('caption-update', (_e: IpcRendererEvent, data: { lang: string; text: string; isFinal: boolean }) => cb(data));
  },

  onSessionState: (cb: (state: string) => void) => {
    ipcRenderer.on('session-state', (_e: IpcRendererEvent, state: string) => cb(state));
  },

  onEventCreated: (cb: (data: { eventCode: string; audienceUrl: string; qrSvg: string }) => void) => {
    ipcRenderer.on('event-created', (_e: IpcRendererEvent, data: { eventCode: string; audienceUrl: string; qrSvg: string }) => cb(data));
  },

  onError: (cb: (message: string) => void) => {
    ipcRenderer.on('app-error', (_e: IpcRendererEvent, message: string) => cb(message));
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
