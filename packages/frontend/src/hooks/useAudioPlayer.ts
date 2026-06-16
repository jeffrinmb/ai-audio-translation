'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Room, RoomEvent, DataPacket_Kind } from 'livekit-client';

/**
 * useAudioPlayer listens for binary audio data messages from the worker
 * on a given topic (e.g. "audio_hi") and plays them back via the Web Audio API.
 *
 * The worker publishes PCM chunks with a 16-byte header:
 *   bytes 0-1:  language code (e.g. "hi")
 *   bytes 4-7:  sample rate as uint32 LE
 *   bytes 8-15: sentAt as int64 LE (ms since epoch, for latency measurement)
 * followed by raw 16-bit PCM audio.
 */
export function useAudioPlayer(room: Room | null, topic: string, muted = false) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  // Lazily create AudioContext on first user interaction
  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = audioCtxRef.current.currentTime;
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  useEffect(() => {
    if (!room) return;

    const handleData = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: DataPacket_Kind,
      receivedTopic?: string,
    ) => {
      if (receivedTopic !== topic) return;

      try {
        const ctx = ensureAudioContext();

        // Parse header: bytes 4-7 = sample rate uint32 LE, bytes 8-15 = sentAt int64 LE
        const dataView = new DataView(payload.buffer, payload.byteOffset);
        const sampleRate = dataView.getUint32(4, true);
        const sentAt = Number(dataView.getBigInt64(8, true));
        const receivedAt = Date.now();
        if (sentAt > 0) {
          setLatencyMs(receivedAt - sentAt);
        }

        // PCM data starts at byte 16
        const pcmBytes = payload.slice(16);
        const int16 = new Int16Array(
          pcmBytes.buffer,
          pcmBytes.byteOffset,
          pcmBytes.byteLength / 2,
        );

        // Convert int16 PCM to float32
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 32768.0;
        }

        // Create and schedule an AudioBuffer
        const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate || 24000);
        audioBuffer.copyToChannel(float32, 0);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        if (muted) {
          const gain = ctx.createGain();
          gain.gain.value = 0;
          source.connect(gain);
          gain.connect(ctx.destination);
        } else {
          source.connect(ctx.destination);
        }

        // Schedule gaplessly
        const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
        source.start(startTime);
        nextPlayTimeRef.current = startTime + audioBuffer.duration;

        setIsPlaying(true);
        source.onended = () => {
          if (nextPlayTimeRef.current <= ctx.currentTime) {
            setIsPlaying(false);
          }
        };
      } catch {
        // Ignore decode errors
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, topic, ensureAudioContext]);

  // Reset when topic changes
  useEffect(() => {
    nextPlayTimeRef.current = 0;
    setIsPlaying(false);
    setLatencyMs(null);
  }, [topic]);

  // Clean up AudioContext on unmount
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close();
    };
  }, []);

  return { isPlaying, latencyMs, ensureAudioContext };
}
