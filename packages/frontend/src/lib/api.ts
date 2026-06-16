/**
 * API client for the NestJS backend.
 * All methods throw on non-2xx responses.
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export interface CreateEventResponse {
  eventCode: string;
  roomName: string;
  speakerJoinUrl: string;
  audienceJoinUrl: string;
  speakerToken: string;
  createdAt: string;
}

export interface EventDetails {
  eventCode: string;
  roomName: string;
  createdAt: string;
  isActive: boolean;
  audienceJoinUrl: string;
  speakerJoinUrl: string;
}

export interface TokenResponse {
  token: string;
  roomName: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${path} failed (${res.status}): ${body}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

/** POST /events — creates a new translation event */
export const createEvent = (): Promise<CreateEventResponse> =>
  request<CreateEventResponse>('/events', { method: 'POST' });

/** GET /events/:code — fetches event metadata */
export const getEvent = (eventCode: string): Promise<EventDetails> =>
  request<EventDetails>(`/events/${eventCode}`);

/** GET /events/:code/audience-token — issues an audience LiveKit token */
export const getAudienceToken = (eventCode: string): Promise<TokenResponse> =>
  request<TokenResponse>(`/events/${eventCode}/audience-token`);

/** GET /events/:code/speaker-token — re-issues a speaker LiveKit token */
export const getSpeakerToken = (eventCode: string): Promise<TokenResponse> =>
  request<TokenResponse>(`/events/${eventCode}/speaker-token`);

/** DELETE /events/:code — ends the session */
export const deleteEvent = (eventCode: string): Promise<void> =>
  request<void>(`/events/${eventCode}`, { method: 'DELETE' });
