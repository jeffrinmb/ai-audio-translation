import * as dotenv from 'dotenv';
import * as path from 'path';
// Load .env from repo root (two levels up from packages/speaker-desktop)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  session,
  IpcMainInvokeEvent,
  IpcMainEvent,
  WebContents,
} from 'electron';
import * as qrcode from 'qrcode';
import { SpeakerSession, CaptionUpdate } from './lib/speaker-session';
import { TargetLanguageCode } from './lib/language-worker';

// ── Environment ────────────────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

// ── State ──────────────────────────────────────────────────────────────────────
let controlWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let speakerSession: SpeakerSession | null = null;
let activeCaptionLang: TargetLanguageCode = 'ja';

// ── Window creation ────────────────────────────────────────────────────────────

function createControlWindow(): void {
  controlWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'AI Translation Speaker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  controlWindow.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  controlWindow.on('closed', () => {
    controlWindow = null;
    destroyOverlay();
    if (speakerSession) {
      speakerSession.stop().catch(console.error);
      speakerSession = null;
    }
  });
}

function createOverlayWindow(): void {
  if (overlayWindow) return;

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width,
    height: 100,
    x: 0,
    y: height - 100,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'overlay.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function destroyOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
  overlayWindow = null;
}

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Grant microphone permission for getUserMedia in renderer
  app.on('session-created', (newSession: Electron.Session) => {
    newSession.setPermissionRequestHandler(
      (_webContents: WebContents, permission: string, callback: (granted: boolean) => void) => {
        callback(permission === 'media' || permission === 'mediaKeySystem');
      },
    );
  });

  // Also grant for the default session (already-created windows)
  session.defaultSession.setPermissionRequestHandler(
    (_webContents: WebContents, permission: string, callback: (granted: boolean) => void) => {
      callback(permission === 'media' || permission === 'mediaKeySystem');
    },
  );

  createControlWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC handlers ───────────────────────────────────────────────────────────────

/** Create an event via the backend API, return eventCode + audience URL + QR SVG */
ipcMain.handle('create-event', async (_e: IpcMainInvokeEvent, title: string) => {
  const res = await fetch(`${BACKEND_URL}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Backend ${res.status}: ${await res.text()}`);
  const event = await res.json() as { eventCode: string; roomName: string };

  const audienceUrl = `${FRONTEND_URL}/event/${event.eventCode}`;
  const qrSvg = await qrcode.toString(audienceUrl, { type: 'svg' });

  controlWindow?.webContents.send('event-created', {
    eventCode: event.eventCode,
    audienceUrl,
    qrSvg,
  });

  return event;
});

/** Start the speaker session: connect LiveKit, boot Gemini workers, open mic */
ipcMain.handle(
  'start-session',
  async (_e: IpcMainInvokeEvent, payload: { eventCode: string; languages: string[] }) => {
    if (speakerSession) await speakerSession.stop();

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !GEMINI_API_KEY) {
      throw new Error('Missing required env vars: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, GEMINI_API_KEY');
    }

    // Derive roomName from backend (fetch event by code to get roomName)
    const res = await fetch(`${BACKEND_URL}/api/events/${payload.eventCode}`);
    if (!res.ok) throw new Error(`Event not found: ${payload.eventCode}`);
    const event = await res.json() as { roomName: string };

    speakerSession = new SpeakerSession({
      roomName: event.roomName,
      livekitUrl: LIVEKIT_URL,
      livekitApiKey: LIVEKIT_API_KEY,
      livekitApiSecret: LIVEKIT_API_SECRET,
      geminiApiKey: GEMINI_API_KEY,
      languages: payload.languages as TargetLanguageCode[],
    });

    speakerSession.on('caption', (update: CaptionUpdate) => {
      if (update.lang === activeCaptionLang) {
        controlWindow?.webContents.send('caption-update', update);
        overlayWindow?.webContents.send('caption-update', update);
      }
    });

    speakerSession.on('sessionState', (state: string) => {
      controlWindow?.webContents.send('session-state', state);
    });

    speakerSession.on('error', (err: Error) => {
      controlWindow?.webContents.send('app-error', err.message);
    });

    await speakerSession.start();
  },
);

/** Stop the speaker session */
ipcMain.handle('end-session', async () => {
  if (speakerSession) {
    await speakerSession.stop();
    speakerSession = null;
  }
});

/** Receive PCM audio chunk from renderer AudioWorklet and feed to Gemini */
ipcMain.on('mic-chunk', (_e: IpcMainEvent, buffer: ArrayBuffer) => {
  speakerSession?.feedAudio(buffer);
});

/** Toggle overlay window visibility */

ipcMain.on('toggle-overlay', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  } else {
    destroyOverlay();
  }
});

/** Close overlay from within the overlay window */
ipcMain.on('close-overlay', () => destroyOverlay());

/** Move overlay between top and bottom of screen */
ipcMain.on('toggle-overlay-position', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const [, currentY] = overlayWindow.getPosition();
  const isAtBottom = currentY > height / 2;
  overlayWindow.setPosition(0, isAtBottom ? 0 : height - 100);
});

/** Set the active caption language for the overlay preview */
ipcMain.on('set-caption-lang', (_e: IpcMainEvent, lang: string) => {
  activeCaptionLang = lang as TargetLanguageCode;
});

