'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Room } from 'livekit-client';
import { BACKEND_URL } from '@/lib/constants';
import type { TargetLanguageCode } from '@/lib/constants';

/**
 * useSpeechCaptions — runs Web Speech API on the speaker's microphone,
 * sends each transcript to the backend for translation, then publishes
 * caption_{lang} data messages to the LiveKit room.
 *
 * Only runs in the speaker's browser (where the mic is active).
 */
export function useSpeechCaptions(
  room: Room | null,
  targetLangs: TargetLanguageCode[],
  enabled: boolean,
) {
  const recogRef = useRef<SpeechRecognition | null>(null);
  const roomRef = useRef<Room | null>(room);

  useEffect(() => { roomRef.current = room; }, [room]);

  const publishCaption = useCallback(
    (lang: string, text: string, isFinal: boolean) => {
      const r = roomRef.current;
      if (!r || !text.trim()) return;
      const payload = new TextEncoder().encode(
        JSON.stringify({ text, isFinal, langCode: lang, ts: Date.now() }),
      );
      console.log(`[SpeechCaptions] publishData topic=caption_${lang}`);
      r.localParticipant.publishData(payload, {
        reliable: true,
        topic: `caption_${lang}`,
      });
    },
    [],
  );

  const lastRequestRef = useRef<number>(0);
  const pendingRef2 = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateAndPublish = useCallback(
    async (englishText: string) => {
      for (const lang of targetLangs) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: englishText, targetLang: lang }),
          });
          if (!res.ok) continue;
          const { translatedText } = await res.json() as { translatedText: string };
          console.log(`[SpeechCaptions] Translated (${lang}):`, translatedText);
          publishCaption(lang, translatedText, true);
        } catch {
          // best-effort, drop on error
        }
      }
    },
    [targetLangs, publishCaption],
  );

  // Throttle: translate at most once every 2 seconds, using the latest final text
  const scheduleTranslate = useCallback(
    (text: string) => {
      pendingRef2.current = text;
      if (timerRef.current) return; // already scheduled
      const now = Date.now();
      const wait = Math.max(0, 2000 - (now - lastRequestRef.current));
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const t = pendingRef2.current;
        pendingRef2.current = null;
        if (t) {
          lastRequestRef.current = Date.now();
          translateAndPublish(t);
        }
      }, wait);
    },
    [translateAndPublish],
  );

  useEffect(() => {
    if (!enabled || !room) return;

    const SpeechRecognitionAPI =
      (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
      (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.warn('[SpeechCaptions] SpeechRecognition not available in this browser');
      return;
    }

    const recog = new SpeechRecognitionAPI();
    recog.continuous = true;
    recog.interimResults = false; // final results only — no interim flooding
    recog.lang = 'en-US';
    recogRef.current = recog;

    recog.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const text = result[0].transcript.trim();
        if (text) { console.log('[SpeechCaptions] Final transcript:', text); scheduleTranslate(text); }
      }
    };

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== 'no-speech') {
        console.error('[SpeechCaptions] Recognition error:', e.error);
      }
    };

    recog.onend = () => {
      // Restart automatically if still enabled
      if (recogRef.current) {
        try { recogRef.current.start(); } catch { /* ignore */ }
      }
    };

    recog.start();
    console.log('[SpeechCaptions] Started, room:', !!room, 'enabled:', enabled);

    return () => {
      recogRef.current = null;
      recog.abort();
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      console.log('[SpeechCaptions] Stopped');
    };
  }, [enabled, room, scheduleTranslate]);
}
