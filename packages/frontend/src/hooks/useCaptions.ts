'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, DataPacket_Kind } from 'livekit-client';

export interface CaptionEntry {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
}

/**
 * useCaptions subscribes to LiveKit data messages for a specific caption topic
 * and accumulates them into a list of caption entries.
 *
 * @param room       - Connected LiveKit Room instance (or null)
 * @param topic      - Data track topic to subscribe to (e.g. "caption_hi")
 */
export function useCaptions(room: Room | null, topic: string): { captions: CaptionEntry[]; latencyMs: number | null } {
  const [captions, setCaptions] = useState<CaptionEntry[]>([]);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!room) return;

    const handleData = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: DataPacket_Kind,
      receivedTopic?: string,
    ) => {
      console.log(`[useCaptions] DataReceived topic="${receivedTopic}" watching="${topic}"`);
      if (receivedTopic !== topic) return;

      try {
        const message = JSON.parse(new TextDecoder().decode(payload)) as {
          text: string;
          isFinal: boolean;
          langCode: string;
          ts: number;
        };

        if (message.ts > 0) {
          setLatencyMs(Date.now() - message.ts);
        }

        setCaptions((prev) => {
          if (!message.isFinal) {
            // Replace the last non-final entry or append a new one
            const last = prev[prev.length - 1];
            if (last && !last.isFinal) {
              return [
                ...prev.slice(0, -1),
                {
                  id: last.id,
                  text: message.text,
                  isFinal: false,
                  timestamp: message.ts,
                },
              ];
            }
            return [
              ...prev,
              {
                id: `cap_${message.ts}`,
                text: message.text,
                isFinal: false,
                timestamp: message.ts,
              },
            ];
          }

          // Finalise the last pending entry
          const last = prev[prev.length - 1];
          if (last && !last.isFinal) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: message.text, isFinal: true },
            ];
          }
          return [
            ...prev,
            {
              id: `cap_${message.ts}`,
              text: message.text,
              isFinal: true,
              timestamp: message.ts,
            },
          ];
        });
      } catch {
        // Ignore malformed messages
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, topic]);

  // Reset when topic changes
  useEffect(() => {
    setCaptions([]);
    setLatencyMs(null);
  }, [topic]);

  return { captions, latencyMs };
}
