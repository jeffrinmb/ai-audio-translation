import { EventEmitter } from 'events';
import { GeminiLiveClient } from './gemini-live.client';

/**
 * Supported target languages and their LiveKit track name suffixes.
 */
export type TargetLanguageCode = 'hi' | 'fr' | 'ar' | 'ja';

/**
 * BCP-47 language codes required by Gemini 3.5 Live Translate's translationConfig.
 * Reference: https://ai.google.dev/gemini-api/docs/live-api/live-translate
 */
const BCP47_CODES: Record<TargetLanguageCode, string> = {
  hi: 'hi',   // Hindi
  fr: 'fr',   // French
  ar: 'ar',   // Arabic
  ja: 'ja',   // Japanese
};

export interface LanguageWorkerConfig {
  languageCode: TargetLanguageCode;
  languageName: string;
  geminiApiKey: string;
  /** Called when translated PCM audio is ready to be published to LiveKit */
  onAudioChunk: (pcmData: Buffer, sampleRate: number) => void;
  /** Called when a caption update is ready to be published as a data track */
  onCaption: (text: string, isFinal: boolean) => void;
}

/**
 * LanguageWorker manages one Gemini 3.5 Live Translate session per target language.
 * It receives raw English PCM audio, forwards it to Gemini, and surfaces
 * translated audio + caption outputs via callbacks.
 *
 * One instance is created per (event × language) pair.
 */
export class LanguageWorker extends EventEmitter {
  private gemini: GeminiLiveClient;
  private readonly config: LanguageWorkerConfig;
  private isReady = false;

  constructor(config: LanguageWorkerConfig) {
    super();
    this.config = config;

    this.gemini = new GeminiLiveClient({
      targetLanguageBcp47: BCP47_CODES[config.languageCode],
      targetLanguageCode: config.languageCode,
      apiKey: config.geminiApiKey,
    });

    this.gemini.on('audioChunk', ({ pcmData, sampleRate }) => {
      config.onAudioChunk(pcmData, sampleRate);
    });

    this.gemini.on('caption', ({ text, isFinal }) => {
      config.onCaption(text, isFinal);
    });

    this.gemini.on('error', (err) => {
      console.error(
        `[LanguageWorker:${config.languageCode}] Gemini error:`,
        err.message,
      );
    });

    this.gemini.on('connected', () => {
      this.isReady = true;
      console.log(`[LanguageWorker:${config.languageCode}] Gemini connected`);
    });

    this.gemini.on('disconnected', () => {
      this.isReady = false;
      console.log(
        `[LanguageWorker:${config.languageCode}] Gemini disconnected`,
      );
    });
  }

  /** Starts the Gemini Live session */
  async start(): Promise<void> {
    await this.gemini.connect();
  }

  /**
   * Forwards an English audio chunk to Gemini.
   * Silently drops chunks if the session is not ready.
   */
  processAudio(pcmData: Buffer): void {
    if (!this.isReady) return;
    this.gemini.sendAudioChunk(pcmData);
  }

  /** Cleanly shuts down the Gemini session */
  stop(): void {
    this.gemini.close();
    this.isReady = false;
  }
}
