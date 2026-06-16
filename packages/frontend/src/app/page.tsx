'use client';

import Link from 'next/link';
import { Mic, Users, Globe2, Zap } from 'lucide-react';

/**
 * Landing page — directs users to either the speaker dashboard or audience join page.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-center gap-3">
        <Globe2 className="text-blue-300" size={28} />
        <span className="text-white text-xl font-bold tracking-tight">
          AI Conference Translation
        </span>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-10">
        <div className="space-y-4 max-w-2xl">
          <h1 className="text-5xl font-extrabold text-white leading-tight">
            Real-Time Conference
            <span className="text-blue-300"> Translation</span>
          </h1>
          <p className="text-blue-200 text-lg">
            Speak once, reach everyone. Powered by Gemini AI and LiveKit for
            instant translation into Hindi, French, Arabic, and Japanese.
          </p>
        </div>

        {/* CTA cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-xl">
          <Link href="/speaker" className="group">
            <div className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl p-8 flex flex-col items-center gap-4 transition-all duration-200 cursor-pointer hover:scale-105">
              <div className="bg-blue-500 rounded-full p-4">
                <Mic className="text-white" size={32} />
              </div>
              <div>
                <h2 className="text-white text-xl font-bold">Speaker</h2>
                <p className="text-blue-200 text-sm mt-1">
                  Create a session and start speaking
                </p>
              </div>
            </div>
          </Link>

          <Link href="/join" className="group">
            <div className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl p-8 flex flex-col items-center gap-4 transition-all duration-200 cursor-pointer hover:scale-105">
              <div className="bg-indigo-500 rounded-full p-4">
                <Users className="text-white" size={32} />
              </div>
              <div>
                <h2 className="text-white text-xl font-bold">Audience</h2>
                <p className="text-blue-200 text-sm mt-1">
                  Join a session with an event code
                </p>
              </div>
            </div>
          </Link>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3">
          {[
            { icon: <Zap size={14} />, label: 'Real-time AI translation' },
            { icon: <Globe2 size={14} />, label: '5 languages supported' },
            { icon: <Mic size={14} />, label: 'Live captions' },
          ].map(({ icon, label }) => (
            <span
              key={label}
              className="flex items-center gap-2 bg-white/10 text-blue-100 text-sm px-4 py-2 rounded-full border border-white/10"
            >
              {icon}
              {label}
            </span>
          ))}
        </div>
      </main>

      <footer className="text-center text-blue-400 text-sm py-6">
        Powered by Gemini AI · LiveKit · Next.js
      </footer>
    </div>
  );
}
