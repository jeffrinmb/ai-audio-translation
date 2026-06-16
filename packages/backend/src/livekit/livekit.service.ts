import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

/**
 * LiveKitService wraps the LiveKit server SDK.
 * Responsible for generating participant tokens and providing
 * a RoomServiceClient for administrative operations.
 */
@Injectable()
export class LiveKitService {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  readonly wsUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.getOrThrow<string>('LIVEKIT_API_KEY');
    this.apiSecret = this.config.getOrThrow<string>('LIVEKIT_API_SECRET');
    this.wsUrl = this.config.getOrThrow<string>('LIVEKIT_URL');
  }

  /**
   * Generates an access token for the speaker.
   * Speaker can publish tracks and subscribe to all tracks.
   */
  async generateSpeakerToken(roomName: string, identity: string): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      ttl: '8h',
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return await token.toJwt();
  }

  /**
   * Generates an access token for an audience member.
   * Audience can only subscribe — never publish.
   */
  async generateAudienceToken(roomName: string, identity: string): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      ttl: '8h',
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
    });

    return await token.toJwt();
  }

  /**
   * Generates an access token for the translation worker.
   * Worker publishes translated audio/data tracks but uses a system identity.
   */
  async generateWorkerToken(roomName: string, identity: string): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      ttl: '24h',
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return await token.toJwt();
  }

  /** Returns a RoomServiceClient for administrative operations (e.g. deleting rooms) */
  getRoomServiceClient(): RoomServiceClient {
    return new RoomServiceClient(this.wsUrl, this.apiKey, this.apiSecret);
  }
}
