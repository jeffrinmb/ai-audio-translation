import { WebSocket } from 'ws';
import { EventEmitter } from 'events';

/**
 * Configuration for a Gemini 3.5 Live Translate session.
 * Uses BCP-47 language codes as required by the translationConfig API.
 */
export interface GeminiLiveConfig {
  /** BCP-47 language code for the translation target, e.g. "hi", "fr", "ar", "ja" */
  targetLanguageBcp47: string;
  /** Short display code used for logging, e.g. "hi" */
  targetLanguageCode: string;
  apiKey: string;
}

/**
 * Emitted when Gemini returns a translated audio PCM chunk.
 * Output format: raw 16-bit PCM at 24kHz mono (little-endian).
 */
export interface TranslatedAudioChunk {
  pcmData: Buffer;
  /** Always 24000 for gemini-3.5-live-translate-preview */
  sampleRate: number;
}

/**
 * Emitted when Gemini returns a transcript of the translated output.
 * Sourced from serverContent.outputTranscription (not modelTurn.parts).
 */
export interface TranslatedCaption {
  text: string;
  isFinal: boolean;
}

/**
 * GeminiLiveClient wraps the Gemini 3.5 Live Translate API over WebSockets.
 *
 * Model: models/gemini-3.5-live-translate-preview
 * Docs: https://ai.google.dev/gemini-api/docs/live-api/live-translate
 *
 * Key API differences from generic Live API:
 *   - Setup uses generationConfig.translationConfig.targetLanguageCode (BCP-47)
 *   - No system_instruction needed — translation is the model's native function
 *   - Captions come via serverContent.outputTranscription.text (not modelTurn parts)
 *   - Input transcription available via serverContent.inputTranscription.text
 *   - Input audio: raw 16-bit PCM at 16kHz mono (100ms chunks recommended)
 *   - Output audio: raw 16-bit PCM at 24kHz mono
 *
 * Events emitted:
 *   'audioChunk'   — TranslatedAudioChunk  (translated speech PCM)
 *   'caption'      — TranslatedCaption     (output transcript)
 *   'error'        — Error
 *   'connected'    — void
 *   'disconnected' — void
 */
export class GeminiLiveClient extends EventEmitter {
  private ws: InstanceType<typeof WebSocket> | null = null;
  private readonly config: GeminiLiveConfig;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isClosing = false;
  private reconnectDelay = 3000;
  private pendingTranscript = '';
  private pendingOriginalText = '';
  private isCycling = false;
  private audioQueue: Buffer[] = [];  // buffers audio during reconnect

  private static readonly MODEL = 'models/gemini-3.5-live-translate-preview';
  private static readonly GEMINI_WS_URL =
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

  constructor(config: GeminiLiveConfig) {
    super();
    this.config = config;
  }

  /**
   * Opens the WebSocket and waits for setupComplete before resolving.
   * Rejects after 15s timeout or on connection error.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${GeminiLiveClient.GEMINI_WS_URL}?key=${this.config.apiKey}`;
      this.ws = new WebSocket(url);
      let settled = false;

      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(setupTimeout);
        if (err) reject(err);
        else {
          this.reconnectDelay = 3000;
          this.emit('connected');
          resolve();
        }
      };

      // Reject if setup takes more than 15 seconds
      const setupTimeout = setTimeout(
        () => settle(new Error('Gemini setup timed out')),
        15000,
      );

      this.ws.once('open', () => this.sendSetup());

      this.ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString('utf8'));
          if (msg.setupComplete) settle();
        } catch { /* handled in handleMessage */ }
        this.handleMessage(data);
      });

      this.ws.once('error', (err) => settle(err));

      this.ws.on('close', () => {
        settle(new Error('WebSocket closed before setupComplete'));
        this.pendingTranscript = '';
        this.pendingOriginalText = '';
        this.emit('disconnected');
        if (!this.isClosing && !this.isCycling) this.scheduleReconnect();
      });

      this.ws.on('error', (err) => this.emit('error', err));
    });
  }

  /**
   * Sends the BidiGenerateContent setup message for Gemini 3.5 Live Translate.
   *
   * translationConfig.targetLanguageCode — BCP-47 code of the output language.
   * inputAudioTranscription              — enables serverContent.inputTranscription.
   * outputAudioTranscription             — enables serverContent.outputTranscription (captions).
   * responseModalities: ['AUDIO']        — request translated speech output.
   */
  private sendSetup(): void {
    const setupMessage = {
      setup: {
        model: GeminiLiveClient.MODEL,
        generation_config: {
          response_modalities: ['AUDIO'],
          translation_config: {
            target_language_code: this.config.targetLanguageBcp47,
            echo_target_language: false,
          },
        },
        output_audio_transcription: {},
      },
    };

    this.ws?.send(JSON.stringify(setupMessage));
    console.log(
      `[GeminiLive:${this.config.targetLanguageCode}] Setup sent → target=${this.config.targetLanguageBcp47}`,
    );
  }

  /**
   * Sends a chunk of raw 16-bit PCM audio (16kHz mono) to Gemini for translation.
   * Recommended chunk size: 100ms = 3200 bytes (16000 Hz × 2 bytes × 0.1s).
   */
  sendAudioChunk(pcmData: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Buffer during reconnect (cap at 50 chunks = 5s)
      if (this.isCycling && this.audioQueue.length < 50) {
        this.audioQueue.push(pcmData);
      }
      return;
    }

    const message = {
      realtime_input: {
        audio: {
          data: pcmData.toString('base64'),
          mime_type: 'audio/pcm;rate=16000',
        },
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  private flushAudioQueue(): void {
    const queued = this.audioQueue.splice(0);
    for (const chunk of queued) {
      this.sendAudioChunk(chunk);
    }
    if (queued.length > 0) {
      console.log(`[GeminiLive:${this.config.targetLanguageCode}] Flushed ${queued.length} buffered chunks`);
    }
  }

  /**
   * Signals end-of-turn to Gemini so it finalises the current translation
   * and does not re-process already-sent audio in the next context window.
   * Call this after a detected silence gap (VAD).
   */
  sendTurnComplete(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ clientContent: { turnComplete: true } }));
  }

  /**
   * Parses incoming server messages from Gemini 3.5 Live Translate.
   *
   * Message types handled:
   *   setupComplete             — session is ready
   *   serverContent.modelTurn   — contains inlineData audio chunks (translated speech)
   *   serverContent.outputTranscription — translated text (captions)
   *   serverContent.inputTranscription  — source English text (logged only)
   */
  private handleMessage(rawData: Buffer): void {
    try {
      const message = JSON.parse(rawData.toString('utf8'));

      if (message.setupComplete) {
        console.log(`[GeminiLive:${this.config.targetLanguageCode}] Setup complete`);
        return;
      }

      if (!message.serverContent) return;
      const content = message.serverContent;

      // ── Translated audio chunks ───────────────────────────────────────────
      if (content.modelTurn?.parts) {
        for (const part of content.modelTurn.parts) {
          if (part.inlineData?.data) {
            const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
            this.emit('audioChunk', { pcmData: audioBuffer, sampleRate: 24000 } as TranslatedAudioChunk);
          }
        }
      }

      // ── Caption (output transcription) ───────────────────────────────────
      if (content.outputTranscription?.text) {
        this.pendingTranscript += content.outputTranscription.text;
        this.emit('caption', { text: this.pendingTranscript, isFinal: false } as TranslatedCaption);
      }

      // ── Turn end: reset transcript ────────────────────────────────────────
      if (content.turnComplete) {
        if (this.pendingTranscript) {
          this.emit('caption', { text: this.pendingTranscript, isFinal: true } as TranslatedCaption);
        }
        this.pendingTranscript = '';
      }
    } catch (err) {
      this.emit('error', new Error(`Failed to parse Gemini message: ${err}`));
    }
  }

  /**
   * Closes and immediately reopens the WebSocket after a turn ends.
   * This clears Gemini's context window, preventing it from re-translating
   * previously heard audio and causing repetition loops.
   */
  private cycleSession(): void {
    if (this.isCycling || this.isClosing) return;
    this.isCycling = true;
    console.log(`[GeminiLive:${this.config.targetLanguageCode}] Cycling session for fresh context`);
    this.ws?.close();
    this.ws = null;
    // Small delay to let the close complete before reconnecting
    setTimeout(async () => {
      if (this.isClosing) { this.isCycling = false; return; }
      try {
        await this.connect();      // isCycling stays true → audio keeps buffering
        this.isCycling = false;
        this.flushAudioQueue();    // drain buffered chunks into fresh session
      } catch (err) {
        this.isCycling = false;
        this.audioQueue = [];
        console.error(`[GeminiLive:${this.config.targetLanguageCode}] Cycle reconnect failed:`, (err as Error).message);
        this.scheduleReconnect();
      }
    }, 200);
  }

  /** Schedules a reconnect with exponential back-off: 3s -> 6s -> 12s -> max 60s */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isClosing) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
    console.log(
      `[GeminiLive:${this.config.targetLanguageCode}] Reconnecting in ${delay}ms...`,
    );
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (err) {
        console.error(
          `[GeminiLive:${this.config.targetLanguageCode}] Reconnect failed: ${(err as Error).message}`,
        );
        this.scheduleReconnect();
      }
    }, delay);
  }

  /** Closes the WebSocket connection cleanly without triggering a reconnect */
  close(): void {
    this.isClosing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
