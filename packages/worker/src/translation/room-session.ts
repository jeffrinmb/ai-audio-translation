import {
  Room,
  RoomEvent,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  AudioFrame,
  AudioStream,
  TrackKind,
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { LanguageWorker, TargetLanguageCode } from './language-worker';

/** Configuration for one RoomSession (one event) */
export interface RoomSessionConfig {
  roomName: string;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  geminiApiKey: string;
  workerIdentity: string;
}

/** Maps language codes to human-readable names */
const LANGUAGES: Record<TargetLanguageCode, string> = {
  hi: 'Hindi',
  fr: 'French',
  ar: 'Arabic',
  ja: 'Japanese',
};

/**
 * RoomSession manages the translation worker's participation in a single LiveKit room.
 *
 * Responsibilities:
 * 1. Joins the LiveKit room as a worker participant.
 * 2. Subscribes to the English audio track (audio_en).
 * 3. Creates one LanguageWorker (Gemini session) per target language.
 * 4. Publishes translated audio tracks (audio_hi, audio_fr, etc.).
 * 5. Publishes caption data tracks (caption_hi, caption_fr, etc.).
 */
export class RoomSession {
  private room: Room;
  private readonly config: RoomSessionConfig;
  private languageWorkers: Map<TargetLanguageCode, LanguageWorker> = new Map();
  private isStarted = false;

  constructor(config: RoomSessionConfig) {
    this.config = config;
    this.room = new Room();
  }

  /** Connects to the LiveKit room and initialises language workers */
  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    // Generate a worker access token
    const token = new AccessToken(
      this.config.livekitApiKey,
      this.config.livekitApiSecret,
      { identity: this.config.workerIdentity, ttl: '24h' },
    );
    token.addGrant({
      roomJoin: true,
      room: this.config.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const jwt = await token.toJwt();

    console.log(
      `[RoomSession:${this.config.roomName}] Connecting to LiveKit...`,
    );

    // Set up language workers before connecting so they are ready
    await this.initLanguageWorkers();

    // Connect to the LiveKit room with autoSubscribe so audio tracks are received
    await this.room.connect(this.config.livekitUrl, jwt, {
      autoSubscribe: true,
      dynacast: false,
    });
    console.log(
      `[RoomSession:${this.config.roomName}] Connected to LiveKit room`,
    );

    // Subscribe to any audio_en tracks already present in the room
    this.room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((pub) => {
        console.log(
          `[RoomSession:${this.config.roomName}] Found existing track: ${pub.name} (kind=${pub.kind})`,
        );
        if (pub.name === 'audio_en') {
          this.subscribeToEnglishTrack(pub, participant);
        }
      });
    });

    // TrackSubscribed fires after autoSubscribe completes for new tracks
    this.room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        console.log(
          `[RoomSession:${this.config.roomName}] TrackSubscribed: ${publication.name} from ${participant.identity}`,
        );
        if (publication.name === 'audio_en') {
          this.subscribeToEnglishTrack(publication, participant);
        }
      },
    );

    // TrackPublished fires when a participant announces a new track
    this.room.on(
      RoomEvent.TrackPublished,
      (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        console.log(
          `[RoomSession:${this.config.roomName}] TrackPublished: ${publication.name} from ${participant.identity}`,
        );
      },
    );
  }

  /** Creates one LanguageWorker per target language */
  private async initLanguageWorkers(): Promise<void> {
    // const targets: TargetLanguageCode[] = ['ja', 'hi', 'ar', 'fr'];
    const targets: TargetLanguageCode[] = ['ja', 'ar'];

    for (let i = 0; i < targets.length; i++) {
      const langCode = targets[i];
      // Stagger connections by 1.5s each to avoid Gemini rate limits
      if (i > 0) await new Promise((r) => setTimeout(r, 1500));

      const worker = new LanguageWorker({
        languageCode: langCode,
        languageName: LANGUAGES[langCode],
        geminiApiKey: this.config.geminiApiKey,
        onAudioChunk: (pcmData, sampleRate) => {
          this.publishAudioChunk(langCode, pcmData, sampleRate);
        },
        onCaption: (text, isFinal) => {
          this.publishCaption(langCode, text, isFinal);
        },
      });

      await worker.start();
      this.languageWorkers.set(langCode, worker);
      console.log(
        `[RoomSession:${this.config.roomName}] Language worker started: ${langCode}`,
      );
    }
  }

  /**
   * Subscribes to the English audio track and pipes PCM frames to all language workers.
   */
  private subscribeToEnglishTrack(
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ): void {
    console.log(
      `[RoomSession:${this.config.roomName}] Subscribing to audio_en from ${participant.identity}`,
    );

    // Request subscription if not auto-subscribed
    publication.setSubscribed(true);

    const track = publication.track;
    if (!track) return;

    // AudioStream is the @livekit/rtc-node async-iterable API for consuming PCM frames
    const stream = new AudioStream(track, 16000, 1);
    this.drainAudioStream(stream);
  }

  /**
   * Drains an AudioStream (async iterable of AudioFrame) and forwards each frame
   * as a 16-bit PCM Buffer to all active language workers.
   * Runs as a background async loop — errors are caught and logged.
   */
  private async drainAudioStream(stream: AudioStream): Promise<void> {
    try {
      for await (const frame of stream as unknown as AsyncIterable<AudioFrame>) {
        // AudioFrame.data is Int16Array — convert to Buffer without copying via subarray
        const pcmBuffer = Buffer.from(
          frame.data.buffer,
          frame.data.byteOffset,
          frame.data.byteLength,
        );
        this.languageWorkers.forEach((worker) => {
          worker.processAudio(pcmBuffer);
        });
      }
    } catch (err) {
      console.error(`[RoomSession:${this.config.roomName}] AudioStream error:`, err);
    }
  }

  /**
   * Publishes a chunk of translated audio as a data message to the room.
   * The frontend receives this and plays it via Web Audio API.
   *
   * Note: LiveKit Node SDK does not support publishing audio tracks from a Node.js
   * server-side participant. We publish translated audio as binary data messages
   * with a structured header. The frontend reconstructs and plays the audio.
   */
  private publishAudioChunk(
    langCode: TargetLanguageCode,
    pcmData: Buffer,
    sampleRate: number,
  ): void {
    const trackName = `audio_${langCode}`;

    // Pack message: 16-byte header (lang[2] + pad[2] + sampleRate[4] + sentAt[8]) + PCM data
    // sentAt is a BigInt64 (ms since epoch) used by the frontend to measure latency.
    const header = Buffer.alloc(16);
    header.write(langCode, 0, 'utf8');
    header.writeUInt32LE(sampleRate, 4);
    header.writeBigInt64LE(BigInt(Date.now()), 8);

    const payload = Buffer.concat([header, pcmData]);

    // Publish as reliable data message to the room
    this.room.localParticipant.publishData(payload, {
      reliable: false, // Use unreliable for low-latency audio streaming
      topic: trackName,
    });
  }

  /**
   * Publishes a caption update as a JSON data message to the room.
   */
  private publishCaption(
    langCode: TargetLanguageCode,
    text: string,
    isFinal: boolean,
  ): void {
    if (!text) return; // skip empty captions
    const captionTrack = `caption_${langCode}`;
    const payload = Buffer.from(
      JSON.stringify({ text, isFinal, langCode, ts: Date.now() }),
      'utf8',
    );
    console.log(`[RoomSession] Caption → topic=${captionTrack} isFinal=${isFinal} text="${text.slice(0, 40)}"`);
    this.room.localParticipant.publishData(payload, {
      reliable: true,
      topic: captionTrack,
    });
  }

  /** Shuts down all workers and disconnects from the room */
  async stop(): Promise<void> {
    this.languageWorkers.forEach((worker) => worker.stop());
    this.languageWorkers.clear();
    await this.room.disconnect();
    this.isStarted = false;
    console.log(`[RoomSession:${this.config.roomName}] Stopped`);
  }
}

