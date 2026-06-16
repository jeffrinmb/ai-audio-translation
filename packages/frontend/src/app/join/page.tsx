'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Users, ArrowRight, AlertCircle } from 'lucide-react';
import { getEvent } from '@/lib/api';

/**
 * Audience join page — /join
 *
 * Audience members enter an event code here to navigate to the event page.
 */
export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = useCallback(async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed.length < 4) {
      setError('Please enter a valid event code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Validate the event exists before navigating
      await getEvent(trimmed);
      router.push(`/event/${trimmed}`);
    } catch {
      setError('Event not found. Please check the code and try again.');
      setLoading(false);
    }
  }, [code, router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md space-y-8">
        {/* Icon + title */}
        <div className="text-center space-y-3">
          <div className="bg-indigo-500/20 rounded-full p-5 inline-block">
            <Users className="text-indigo-400" size={40} />
          </div>
          <h1 className="text-3xl font-bold">Join a Session</h1>
          <p className="text-slate-400 text-sm">
            Enter the 6-character event code provided by the speaker,
            or scan the QR code to join directly.
          </p>
        </div>

        {/* Input card */}
        <div className="bg-slate-800 rounded-2xl p-8 space-y-5">
          <div className="space-y-2">
            <label htmlFor="event-code" className="text-sm font-medium text-slate-300">
              Event Code
            </label>
            <input
              id="event-code"
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="e.g. ABC123"
              maxLength={8}
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white text-xl font-mono tracking-widest placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-center"
              autoComplete="off"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={loading || !code.trim()}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Checking...
              </>
            ) : (
              <>
                Join Session
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>

        <p className="text-center text-slate-500 text-xs">
          Are you a speaker?{' '}
          <a href="/speaker" className="text-indigo-400 hover:underline">
            Go to Speaker Dashboard
          </a>
        </p>
      </div>
    </div>
  );
}
