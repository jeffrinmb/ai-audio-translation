/**
 * Represents a single translation event / conference session.
 * Stored in-memory (no database for MVP).
 */
export interface Event {
  /** Short alphanumeric code that audiences use to join */
  eventCode: string;

  /** LiveKit room name derived from eventCode */
  roomName: string;

  /** ISO timestamp of when the event was created */
  createdAt: string;

  /** Whether the speaker has started the session */
  isActive: boolean;

  /** Pre-built audience join URL (frontend route) */
  audienceJoinUrl: string;

  /** Pre-built speaker join URL (frontend route) */
  speakerJoinUrl: string;
}
