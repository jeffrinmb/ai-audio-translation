import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Event } from './event.interface';
import { customAlphabet } from 'nanoid';

/** Generates short uppercase alphanumeric event codes like "ABC123" */
const generateCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

@Injectable()
export class EventsService {
  /** In-memory store — sufficient for MVP; no database needed */
  private readonly events: Map<string, Event> = new Map();

  constructor(private readonly config: ConfigService) {}

  /**
   * Creates a new translation event with a unique event code.
   * Returns URLs that the frontend will use for QR codes and sharing.
   */
  createEvent(): Event {
    const eventCode = generateCode();
    const roomName = `event_${eventCode}`;

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const event: Event = {
      eventCode,
      roomName,
      createdAt: new Date().toISOString(),
      isActive: false,
      audienceJoinUrl: `${frontendUrl}/event/${eventCode}`,
      speakerJoinUrl: `${frontendUrl}/speaker?event=${eventCode}`,
    };

    this.events.set(eventCode, event);
    console.log(`[EventsService] Created event ${eventCode} → room ${roomName}`);
    return event;
  }

  /** Retrieves an event by code; throws 404 if not found */
  getEvent(eventCode: string): Event {
    const event = this.events.get(eventCode.toUpperCase());
    if (!event) {
      throw new NotFoundException(`Event ${eventCode} not found`);
    }
    return event;
  }

  /** Marks an event as active (speaker started) */
  activateEvent(eventCode: string): Event {
    const event = this.getEvent(eventCode);
    event.isActive = true;
    return event;
  }

  /** Removes the event from the in-memory store (session ended) */
  deleteEvent(eventCode: string): void {
    const upper = eventCode.toUpperCase();
    if (!this.events.has(upper)) {
      throw new NotFoundException(`Event ${eventCode} not found`);
    }
    this.events.delete(upper);
    console.log(`[EventsService] Deleted event ${upper}`);
  }

  /** Returns all stored events (useful for worker service polling) */
  getAllEvents(): Event[] {
    return Array.from(this.events.values());
  }
}
