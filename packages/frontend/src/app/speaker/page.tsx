'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Room, LocalTrack, createLocalAudioTrack, RoomEvent } from 'livekit-client';
import { QRCodeSVG } from 'qrcode.react';
import { Mic, MicOff, Play, Square, Copy, CheckCircle, AlertCircle, Globe2, Timer } from 'lucide-react';
import { createEvent, deleteEvent, getSpeakerToken, type CreateEventResponse } from '@/lib/api';
import { LANGUAGES, LANGUAGE_MAP, type LanguageCode, type TargetLanguageCode, LIVEKIT_URL } from '@/lib/constants';
import { LanguageSelector } from '@/components/LanguageSelector';
import { CaptionPanel } from '@/components/CaptionPanel';
import { useCaptions } from '@/hooks/useCaptions';
import clsx from 'clsx';

type SessionState = 'idle' | 'creating' | 'ready' | 'connecting' | 'live' | 'ending';

/**
 * Speaker Dashboard — /speaker
 *
 * Allows a conference speaker to:
 * 1. Create a translation event (generates event code + QR)
 * 2. Start a session (connects to LiveKit and publishes microphone audio)
 * 3. View live captions in a selected language
 * 4. End the session
 */
export default function SpeakerPage() {
  const [state, setState] = useState<SessionState>('idle');
  const [event, setEvent] = useState<CreateEventResponse | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [captionLang, setCaptionLang] = useState<LanguageCode>('ja');
  const [micError, setMicError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioTrackRef = useRef<LocalTrack | null>(null);
  const roomRef = useRef<Room | null>(null);

  const selectedLang = LANGUAGE_MAP[captionLang];
  const { captions, latencyMs } = useCaptions(room, selectedLang.captionTopic);

  /** Step 1: Create a new event via the backend API */
  const handleCreateEvent = useCallback(async () => {
    setState('creating');
    setError(null);
    try {
      const ev = await createEvent();
      setEvent(ev);
      setState('ready');
    } catch (err: any) {
      setError(err.message || 'Failed to create event');
      setState('idle');
    }
  }, []);

  /** Step 2: Start the session — request mic access and connect to LiveKit */
  const handleStartSession = useCallback(async () => {
    if (!event) return;
    setState('connecting');
    setMicError(null);
    setError(null);

    try {
      // Request microphone permission
      const audioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      audioTrackRef.current = audioTrack;

      // Get a fresh speaker token (token from createEvent may have expired)
      const { token } = await getSpeakerToken(event.eventCode);

      const lkRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      lkRoom.on(RoomEvent.Disconnected, () => {
        setError('Disconnected from the session. Please reconnect.');
        setState('ready');
        setRoom(null);
      });

      await lkRoom.connect(LIVEKIT_URL, token);

      // Publish the English audio track with the required name
      await lkRoom.localParticipant.publishTrack(audioTrack, {
        name: 'audio_en',
        simulcast: false,
      });

      roomRef.current = lkRoom;
      setRoom(lkRoom);
      setState('live');
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
        setMicError('Microphone access denied. Please allow microphone access and try again.');
      } else {
        setError(err.message || 'Failed to start session');
      }
      setState('ready');
    }
  }, [event]);

  /** Step 3: End the session — unpublish tracks, disconnect, delete event */
  const handleEndSession = useCallback(async () => {
    if (!event) return;
    setState('ending');

    try {
      audioTrackRef.current?.stop();
      audioTrackRef.current = null;
      await roomRef.current?.disconnect();
      roomRef.current = null;
      setRoom(null);
      await deleteEvent(event.eventCode);
    } catch {
      // Best-effort cleanup
    }

    setEvent(null);
    setState('idle');
  }, [event]);

  /** Copy event code to clipboard */
  const handleCopyCode = useCallback(() => {
    if (!event) return;
    navigator.clipboard.writeText(event.eventCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [event]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      audioTrackRef.current?.stop();
      roomRef.current?.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center gap-3">
        <Globe2 className="text-blue-400" size={22} />
        <h1 className="font-bold text-lg">Speaker Dashboard</h1>
        {state === 'live' && (
          <span className="ml-auto flex items-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-full text-sm font-medium">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            LIVE
          </span>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Error banner */}
        {(error || micError) && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <p className="text-sm">{error || micError}</p>
          </div>
        )}

        {/* === IDLE STATE === */}
        {state === 'idle' && (
          <div className="flex flex-col items-center justify-center py-20 gap-6">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-8 text-center max-w-md space-y-4">
              <Mic className="text-blue-400 mx-auto" size={48} />
              <h2 className="text-2xl font-bold">Start a Translation Session</h2>
              <p className="text-slate-400 text-sm">
                Create an event to generate a room code and QR code for your audience.
              </p>
              <button
                onClick={handleCreateEvent}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Create Event
              </button>
            </div>
          </div>
        )}

        {/* === CREATING STATE === */}
        {state === 'creating' && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-400">Creating event...</p>
            </div>
          </div>
        )}

        {/* === READY / CONNECTING / LIVE / ENDING STATES === */}
        {event && (state === 'ready' || state === 'connecting' || state === 'live' || state === 'ending') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column: Event info + QR */}
            <div className="space-y-6">
              {/* Event code card */}
              <div className="bg-slate-800 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Event Code</h2>
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-mono font-bold tracking-widest text-blue-300">
                    {event.eventCode}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="ml-auto p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                    title="Copy event code"
                  >
                    {copied ? (
                      <CheckCircle size={18} className="text-green-400" />
                    ) : (
                      <Copy size={18} className="text-slate-300" />
                    )}
                  </button>
                </div>
                <p className="text-slate-400 text-xs break-all">{event.audienceJoinUrl}</p>
              </div>

              {/* QR Code */}
              <div className="bg-slate-800 rounded-2xl p-6 space-y-3">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Audience QR Code</h2>
                <div className="bg-white rounded-xl p-4 inline-block">
                  <QRCodeSVG
                    value={event.audienceJoinUrl}
                    size={160}
                    level="M"
                  />
                </div>
                <p className="text-slate-400 text-xs">
                  Scan to join as an audience member
                </p>
              </div>

              {/* Session controls */}
              <div className="bg-slate-800 rounded-2xl p-6 space-y-3">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Session Control</h2>
                {state === 'ready' && (
                  <button
                    onClick={handleStartSession}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors"
                  >
                    <Play size={18} />
                    Start Session
                  </button>
                )}
                {state === 'connecting' && (
                  <button disabled className="w-full flex items-center justify-center gap-2 bg-green-700 text-green-300 font-semibold py-3 rounded-xl opacity-60 cursor-not-allowed">
                    <div className="w-4 h-4 border-2 border-green-300 border-t-transparent rounded-full animate-spin" />
                    Connecting...
                  </button>
                )}
                {state === 'live' && (
                  <button
                    onClick={handleEndSession}
                    className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold py-3 rounded-xl transition-colors"
                  >
                    <Square size={18} />
                    End Session
                  </button>
                )}
                {state === 'ending' && (
                  <button disabled className="w-full flex items-center justify-center gap-2 bg-red-700 text-red-300 font-semibold py-3 rounded-xl opacity-60 cursor-not-allowed">
                    <div className="w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
                    Ending...
                  </button>
                )}
              </div>
            </div>

            {/* Right column: Mic status + Captions */}
            <div className="space-y-6">
              {/* Mic status */}
              <div className="bg-slate-800 rounded-2xl p-6 space-y-3">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Microphone</h2>
                <div className={clsx(
                  'flex items-center gap-3 p-3 rounded-xl',
                  state === 'live' ? 'bg-green-500/10 border border-green-500/20' : 'bg-slate-700/50',
                )}>
                  {state === 'live' ? (
                    <>
                      <Mic className="text-green-400" size={20} />
                      <span className="text-green-300 text-sm font-medium">Microphone active — publishing audio_en</span>
                    </>
                  ) : (
                    <>
                      <MicOff className="text-slate-500" size={20} />
                      <span className="text-slate-400 text-sm">Microphone inactive</span>
                    </>
                  )}
                </div>
              </div>

              {/* Caption language selector */}
              <div className="bg-slate-800 rounded-2xl p-6 space-y-4">
                <LanguageSelector
                  selected={captionLang}
                  onChange={setCaptionLang}
                  includeEnglish={false}
                  label="Caption Language"
                />
              </div>

              {/* Translation latency badge */}
              <div className={clsx(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-medium',
                latencyMs === null
                  ? 'bg-slate-800 border-slate-700 text-slate-500'
                  : latencyMs < 1000
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : latencyMs < 2500
                      ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
                      : 'bg-red-500/10 border-red-500/20 text-red-300',
              )}>
                <Timer size={14} />
                <span>Translation latency:</span>
                <span className="font-mono font-bold ml-auto">
                  {latencyMs === null ? '—' : `${latencyMs.toLocaleString()} ms`}
                </span>
              </div>

              {/* Caption panel */}
              <div className="bg-slate-800 rounded-2xl p-6 flex flex-col min-h-[240px]">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Live Captions — {selectedLang.name}
                </h2>
                <CaptionPanel
                  captions={captions}
                  dir={selectedLang.dir}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
