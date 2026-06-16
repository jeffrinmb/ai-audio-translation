import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { LiveKitService } from '../livekit/livekit.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly liveKitService: LiveKitService,
  ) {}

  /**
   * POST /api/events
   * Creates a new translation event and returns tokens + URLs.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createEvent() {
    const event = this.eventsService.createEvent();

    // Generate a speaker token immediately so the frontend can connect
    const speakerToken = await this.liveKitService.generateSpeakerToken(
      event.roomName,
      'speaker',
    );

    return {
      eventCode: event.eventCode,
      roomName: event.roomName,
      speakerJoinUrl: event.speakerJoinUrl,
      audienceJoinUrl: event.audienceJoinUrl,
      speakerToken,
      createdAt: event.createdAt,
    };
  }

  /**
   * GET /api/events/all
   * Returns all active events. Used by the translation worker to discover rooms.
   * MUST be declared before /:eventCode to avoid 'all' being matched as a param.
   */
  @Get('all')
  getAllEvents() {
    return this.eventsService.getAllEvents();
  }

  /**
   * GET /api/events/:eventCode
   * Returns metadata for an existing event.
   */
  @Get(':eventCode')
  getEvent(@Param('eventCode') eventCode: string) {
    return this.eventsService.getEvent(eventCode);
  }

  /**
   * GET /api/events/:eventCode/audience-token
   * Issues a fresh LiveKit audience token for the given event.
   * Called by the audience client after joining.
   */
  @Get(':eventCode/audience-token')
  async getAudienceToken(@Param('eventCode') eventCode: string) {
    const event = this.eventsService.getEvent(eventCode);
    const audienceId = `audience_${Date.now()}`;
    const token = await this.liveKitService.generateAudienceToken(
      event.roomName,
      audienceId,
    );
    return { token, roomName: event.roomName };
  }

  /**
   * GET /api/events/:eventCode/speaker-token
   * Re-issues a speaker token (e.g. on page reload).
   */
  @Get(':eventCode/speaker-token')
  async getSpeakerToken(@Param('eventCode') eventCode: string) {
    const event = this.eventsService.getEvent(eventCode);
    const token = await this.liveKitService.generateSpeakerToken(
      event.roomName,
      'speaker',
    );
    return { token, roomName: event.roomName };
  }

  /**
   * DELETE /api/events/:eventCode
   * Ends the session and removes the event from memory.
   */
  @Delete(':eventCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEvent(@Param('eventCode') eventCode: string) {
    this.eventsService.deleteEvent(eventCode);
  }
}
