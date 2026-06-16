'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Room,
  RoomEvent,
  ConnectionState,
} from 'livekit-client';
import {
  Volume2,
  VolumeX,
  Globe2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Headphones,
  Timer,
} from 'lucide-react';
import { getAudienceToken } from '@/lib/api';
import { LANGUAGES, LANGUAGE_MAP, type LanguageCode, LIVEKIT_URL } from '@/lib/constants';
import { LanguageSelector } from '@/components/LanguageSelector';
import { CaptionPanel } from '@/components/CaptionPanel';
import { useCaptions } from '@/hooks/useCaptions';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import clsx from 'clsx';

type PageState = 'connecting' | 'connected' | 'error' | 'disconnected';

/**
 * Audience Event Page — /event/[eventCode]
 *
 * Audience members land here after scanning the QR code or entering the event code.
 * They connect to the LiveKit room as a subscriber, choose their language,
 * and listen to translated audio with live captions.
 */
export default function EventPage() {
  const params = useParams();
  const router = useRouter();
  const eventCode = (params.eventCode as string)?.toUpperCase();

  const [pageState, setPageState] = useState<PageState>('connecting');
  const [room, setRoom] = useState<Room | null>(null);
  const [language, setLanguage] = useState<LanguageCode>('ja');
  const [error, setError] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const roomRef = useRef<Room | null>(null);

  const selectedLang = LANGUAGE_MAP[language];
  const { captions } = useCaptions(room, selectedLang.captionTopic);
  const { isPlaying, latencyMs, ensureAudioContext } = useAudioPlayer(
    room,
    selectedLang.audioTrack,
  );

  /** Connect to the LiveKit room as an audience subscriber */
  const connectToRoom = useCallback(async () => {
    if (!eventCode) return;

    try {
      const { token, roomName } = await getAudienceToken(eventCode);

      const lkRoom = new Room({
        adaptiveStream: true,
        dynacast: false,
      });

      lkRoom.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Connected) {
          setPageState('connected');
        } else if (state === ConnectionState.Disconnected) {
          setPageState('disconnected');
          setError('Disconnected from the session.');
        } else if (state === ConnectionState.Reconnecting) {
          setPageState('connecting');
          setError(null);
        }
      });

      lkRoom.on(RoomEvent.Disconnected, () => {
        setPageState('disconnected');
      });

      await lkRoom.connect(LIVEKIT_URL, token);

      roomRef.current = lkRoom;
      setRoom(lkRoom);
      setPageState('connected');
    } catch (err: any) {
      if (err?.message?.includes('404') || err?.message?.includes('not found')) {
        setError('This event does not exist or has ended.');
      } else {
        setError(err.message || 'Failed to connect to the session.');
      }
      setPageState('error');
    }
  }, [eventCode]);

  useEffect(() => {
    connectToRoom();
    return () => {
      roomRef.current?.disconnect();
    };
  }, [connectToRoom]);

  /** Unlock Web Audio API (requires user gesture on mobile/some browsers) */
  const handleUnlockAudio = useCallback(() => {
    ensureAudioContext();
    setAudioUnlocked(true);
  }, [ensureAudioContext]);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => router.push('/join')}
          className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft size={18} className="text-slate-400" />
        </button>
        <Globe2 className="text-indigo-400" size={20} />
        <div>
          <h1 className="font-bold text-sm leading-tight">Conference Session</h1>
          <p className="text-slate-400 text-xs font-mono">{eventCode}</p>
        </div>
        <div className="ml-auto">
          {pageState === 'connected' && (
            <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              Connected
            </span>
          )}
          {pageState === 'connecting' && (
            <span className="flex items-center gap-1.5 text-yellow-400 text-xs font-medium">
              <Loader2 size={12} className="animate-spin" />
              Connecting
            </span>
          )}
          {(pageState === 'error' || pageState === 'disconnected') && (
            <span className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
              {pageState === 'disconnected' ? 'Disconnected' : 'Error'}
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Error state */}
        {(pageState === 'error' || pageState === 'disconnected') && error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <p className="text-red-300 text-sm">{error}</p>
              <button
                onClick={() => { setPageState('connecting'); setError(null); connectToRoom(); }}
                className="text-xs text-indigo-400 hover:underline"
              >
                Try reconnecting
              </button>
            </div>
          </div>
        )}

        {/* Connecting spinner */}
        {pageState === 'connecting' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="text-indigo-400 animate-spin" size={40} />
            <p className="text-slate-400 text-sm">Joining session {eventCode}...</p>
          </div>
        )}

        {/* Connected state */}
        {pageState === 'connected' && (
          <>
            {/* Audio unlock prompt (browsers require user gesture) */}
            {!audioUnlocked && (
              <button
                onClick={handleUnlockAudio}
                className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-4 rounded-2xl transition-colors"
              >
                <Headphones size={20} />
                Tap to Enable Audio
              </button>
            )}

            {/* Language selector */}
            <div className="bg-slate-800 rounded-2xl p-5 space-y-4">
              <LanguageSelector
                selected={language}
                onChange={(code) => {
                  setLanguage(code);
                  if (!audioUnlocked) {
                    ensureAudioContext();
                    setAudioUnlocked(true);
                  }
                }}
                includeEnglish={false}
                label="Select Your Language"
              />
            </div>

            {/* Audio status indicator */}
            <div className={clsx(
              'flex items-center gap-3 px-4 py-3 rounded-xl border',
              isPlaying
                ? 'bg-green-500/10 border-green-500/20 text-green-300'
                : 'bg-slate-800 border-slate-700 text-slate-400',
            )}>
              {isPlaying ? (
                <>
                  <Volume2 size={18} />
                  <span className="text-sm font-medium">
                    Playing translated audio — {selectedLang.name}
                  </span>
                  <span className="ml-auto flex gap-1">
                    {[...Array(4)].map((_, i) => (
                      <span
                        key={i}
                        className="w-1 bg-green-400 rounded-full animate-bounce"
                        style={{
                          height: `${8 + i * 4}px`,
                          animationDelay: `${i * 0.1}s`,
                        }}
                      />
                    ))}
                  </span>
                </>
              ) : (
                <>
                  <VolumeX size={18} />
                  <span className="text-sm">
                    Waiting for {selectedLang.name} audio...
                  </span>
                </>
              )}
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

            {/* Captions */}
            <div className="bg-slate-800 rounded-2xl p-5 flex flex-col min-h-[280px]">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Live Captions — {selectedLang.name}
              </h2>
              <div className="flex-1">
                <CaptionPanel
                  captions={captions}
                  dir={selectedLang.dir}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
