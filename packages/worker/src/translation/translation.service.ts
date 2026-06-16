import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RoomSession } from './room-session';

interface ActiveSession {
  roomName: string;
  session: RoomSession;
  startedAt: Date;
}

/**
 * TranslationService is the top-level orchestrator for the worker process.
 *
 * It polls the backend API for active events and starts/stops RoomSessions
 * accordingly. One RoomSession = one event = four language pipelines.
 *
 * Polling interval: 10 seconds (configurable).
 */
@Injectable()
export class TranslationService implements OnModuleInit, OnModuleDestroy {
  /** Active room sessions keyed by roomName */
  private sessions: Map<string, ActiveSession> = new Map();

  private readonly livekitUrl: string;
  private readonly livekitApiKey: string;
  private readonly livekitApiSecret: string;
  private readonly geminiApiKey: string;
  private readonly backendUrl: string;

  constructor(private readonly config: ConfigService) {
    this.livekitUrl = config.getOrThrow<string>('LIVEKIT_URL');
    this.livekitApiKey = config.getOrThrow<string>('LIVEKIT_API_KEY');
    this.livekitApiSecret = config.getOrThrow<string>('LIVEKIT_API_SECRET');
    this.geminiApiKey = config.getOrThrow<string>('GEMINI_API_KEY');
    this.backendUrl =
      config.get<string>('BACKEND_URL') || 'http://localhost:4000';
  }

  async onModuleInit(): Promise<void> {
    console.log('[TranslationService] Starting — polling backend for events');
    await this.syncEvents();
  }

  async onModuleDestroy(): Promise<void> {
    console.log('[TranslationService] Shutting down all sessions...');
    for (const { session, roomName } of this.sessions.values()) {
      console.log(`[TranslationService] Stopping session: ${roomName}`);
      await session.stop().catch(console.error);
    }
    this.sessions.clear();
  }

  /**
   * Polls the backend every 10 seconds to discover new events.
   * Starts a new RoomSession for any event that doesn't yet have one.
   * Cleans up sessions for events that have been deleted.
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async syncEvents(): Promise<void> {
    try {
      const response = await fetch(`${this.backendUrl}/api/events/all`);
      if (!response.ok) {
        console.warn(
          `[TranslationService] Backend responded ${response.status}`,
        );
        return;
      }

      const events: Array<{ roomName: string; eventCode: string }> =
        await response.json();

      const activeRoomNames = new Set(events.map((e) => e.roomName));

      // Stop sessions for events that no longer exist
      for (const [roomName, active] of this.sessions.entries()) {
        if (!activeRoomNames.has(roomName)) {
          console.log(
            `[TranslationService] Event removed, stopping session: ${roomName}`,
          );
          await active.session.stop().catch(console.error);
          this.sessions.delete(roomName);
        }
      }

      // Start sessions for new events
      for (const event of events) {
        if (!this.sessions.has(event.roomName)) {
          await this.startSession(event.roomName);
        }
      }
    } catch (err) {
      const msg = err?.cause?.code === 'ECONNREFUSED'
        ? `Backend not reachable at ${this.backendUrl} (ECONNREFUSED)`
        : err.message;
      console.error('[TranslationService] Failed to sync events:', msg);
    }
  }

  /** Starts a new RoomSession for the given room */
  private async startSession(roomName: string): Promise<void> {
    console.log(
      `[TranslationService] Starting translation session for: ${roomName}`,
    );

    const session = new RoomSession({
      roomName,
      livekitUrl: this.livekitUrl,
      livekitApiKey: this.livekitApiKey,
      livekitApiSecret: this.livekitApiSecret,
      geminiApiKey: this.geminiApiKey,
      workerIdentity: `worker_${roomName}`,
    });

    // Register immediately to prevent duplicate sessions on next poll cycle
    this.sessions.set(roomName, { roomName, session, startedAt: new Date() });

    try {
      await session.start();
      console.log(
        `[TranslationService] Session active for room: ${roomName}`,
      );
    } catch (err) {
      console.error(
        `[TranslationService] Failed to start session for ${roomName}:`,
        err.message,
      );
      // Remove from map so next poll can retry after a clean state
      this.sessions.delete(roomName);
      await session.stop().catch(() => {});
    }
  }
}
