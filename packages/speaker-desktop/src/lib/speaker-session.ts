import { EventEmitter } from 'events';
import { Room } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { LanguageWorker, TargetLanguageCode } from './language-worker';

/** 16kHz 16-bit mono — 100ms = 3200 bytes */
const SAMPLE_RATE = 16000;

const LANGUAGES: Record<TargetLanguageCode, string> = {
  hi: 'Hindi',
  fr: 'French',
  ar: 'Arabic',
  ja: 'Japanese',
};

export interface SpeakerSessionConfig {
  roomName: string;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  geminiApiKey: string;
  /** Language codes to translate into. Defaults to all 4. */
  languages?: TargetLanguageCode[];
}

export interface CaptionUpdate {
  lang: TargetLanguageCode;
  text: string;
  isFinal: boolean;
}

/**
 * SpeakerSession replaces the separate worker process.
 *
 * It:
 *  1. Receives 16kHz 16-bit mono PCM from the renderer via feedAudio() (getUserMedia path)
 *  2. Publishes raw mic PCM to LiveKit as `audio_en` data topic (for audience raw-English option)
 *  3. Fans out PCM to one LanguageWorker (Gemini Live Translate) per target language
 *  4. Publishes translated `audio_<lang>` PCM and `caption_<lang>` JSON to LiveKit data
 *  5. Emits 'caption' events locally for the Electron overlay (zero-latency, no LiveKit hop)
 *
 * Events:
 *   'caption'      — CaptionUpdate
 *   'sessionState' — 'connecting' | 'live' | 'stopped' | 'error'
 *   'error'        — Error
 *
 * Mic audio is pushed in from the renderer process via feedAudio().
 * No native modules required.
 */
export class SpeakerSession extends EventEmitter {
  private room: Room;
  private readonly config: SpeakerSessionConfig;
  private languageWorkers: Map<TargetLanguageCode, LanguageWorker> = new Map();
  private isRunning = false;

  constructor(config: SpeakerSessionConfig) {
    super();
    this.config = config;
    this.room = new Room();
  }

  /** Connects to LiveKit and starts Gemini workers. Call feedAudio() to stream mic PCM. */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.emit('sessionState', 'connecting');

    try {
      await this.connectToLiveKit();
      await this.initLanguageWorkers();
      this.emit('sessionState', 'live');
      console.log('[SpeakerSession] Live — ready for audio input');
    } catch (err) {
      this.isRunning = false;
      this.emit('sessionState', 'error');
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * Called by main.ts IPC handler with each 100ms Int16 PCM chunk
   * arriving from the renderer's AudioWorklet.
   * @param int16Buffer — raw ArrayBuffer of Int16 samples at 16kHz mono
   */
  feedAudio(int16Buffer: ArrayBuffer): void {
    if (!this.isRunning) return;
    const pcm = Buffer.from(int16Buffer);
    this.publishEnglishAudio(pcm);
    this.languageWorkers.forEach((worker) => worker.processAudio(pcm));
  }

  /** Cleanly stops workers and LiveKit */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    this.languageWorkers.forEach((w) => w.stop());
    this.languageWorkers.clear();

    try {
      await this.room.disconnect();
    } catch { /* ignore disconnect errors */ }

    this.emit('sessionState', 'stopped');
    console.log('[SpeakerSession] Stopped');
  }

  // ── LiveKit ───────────────────────────────────────────────────────────────

  private async connectToLiveKit(): Promise<void> {
    const token = new AccessToken(
      this.config.livekitApiKey,
      this.config.livekitApiSecret,
      { identity: `speaker_${this.config.roomName}`, ttl: '24h' },
    );
    token.addGrant({
      roomJoin: true,
      room: this.config.roomName,
      canPublish: true,
      canSubscribe: false,
      canPublishData: true,
    });
    const jwt = await token.toJwt();

    await this.room.connect(this.config.livekitUrl, jwt, {
      autoSubscribe: false,
      dynacast: false,
    });
    console.log(`[SpeakerSession] Connected to LiveKit room: ${this.config.roomName}`);
  }

  /** Publishes raw 16kHz PCM as `audio_en` data topic (binary, same header format) */
  private publishEnglishAudio(pcm: Buffer): void {
    const header = Buffer.alloc(16);
    header.write('en', 0, 'utf8');
    header.writeUInt32LE(SAMPLE_RATE, 4);
    header.writeBigInt64LE(BigInt(Date.now()), 8);
    const payload = Buffer.concat([header, pcm]);
    try {
      this.room.localParticipant?.publishData(payload, {
        reliable: false,
        topic: 'audio_en',
      });
    } catch { /* room may be disconnecting */ }
  }

  /** Publishes translated PCM as `audio_<lang>` data topic */
  private publishTranslatedAudio(
    lang: TargetLanguageCode,
    pcm: Buffer,
    sampleRate: number,
  ): void {
    const header = Buffer.alloc(16);
    header.write(lang, 0, 'utf8');
    header.writeUInt32LE(sampleRate, 4);
    header.writeBigInt64LE(BigInt(Date.now()), 8);
    const payload = Buffer.concat([header, pcm]);
    try {
      this.room.localParticipant?.publishData(payload, {
        reliable: false,
        topic: `audio_${lang}`,
      });
    } catch { /* room may be disconnecting */ }
  }

  /** Publishes caption JSON as `caption_<lang>` data topic */
  private publishCaption(lang: TargetLanguageCode, text: string, isFinal: boolean): void {
    if (!text) return;
    const payload = Buffer.from(
      JSON.stringify({ text, isFinal, langCode: lang, ts: Date.now() }),
      'utf8',
    );
    console.log(`[SpeakerSession] Caption → topic=caption_${lang} isFinal=${isFinal} "${text.slice(0, 40)}"`);
    try {
      this.room.localParticipant?.publishData(payload, {
        reliable: true,
        topic: `caption_${lang}`,
      });
    } catch { /* room may be disconnecting */ }

    // Also emit locally for the overlay (zero-latency path)
    this.emit('caption', { lang, text, isFinal } as CaptionUpdate);
  }

  // ── Language workers ──────────────────────────────────────────────────────

  private async initLanguageWorkers(): Promise<void> {
    const targets = this.config.languages ?? (['ja', 'ar', 'hi', 'fr'] as TargetLanguageCode[]);

    for (let i = 0; i < targets.length; i++) {
      const langCode = targets[i];
      if (i > 0) await new Promise<void>((r) => setTimeout(r, 1500));

      const worker = new LanguageWorker({
        languageCode: langCode,
        languageName: LANGUAGES[langCode],
        geminiApiKey: this.config.geminiApiKey,
        onAudioChunk: (pcm, sr) => this.publishTranslatedAudio(langCode, pcm, sr),
        onCaption: (text, isFinal) => this.publishCaption(langCode, text, isFinal),
      });

      await worker.start();
      this.languageWorkers.set(langCode, worker);
      console.log(`[SpeakerSession] Language worker started: ${langCode}`);
    }
  }

}
