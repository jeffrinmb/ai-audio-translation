'use client';

import { useEffect, useRef } from 'react';
import { CaptionEntry } from '@/hooks/useCaptions';
import clsx from 'clsx';

interface CaptionPanelProps {
  captions: CaptionEntry[];
  dir?: 'ltr' | 'rtl';
  label?: string;
}

/**
 * CaptionPanel renders scrolling live captions.
 * Auto-scrolls to the bottom as new captions arrive.
 */
export function CaptionPanel({ captions, dir = 'ltr', label }: CaptionPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [captions]);

  return (
    <div className="flex flex-col gap-2 h-full">
      {label && (
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </p>
      )}
      <div
        className="flex-1 bg-black/80 rounded-xl p-4 overflow-y-auto caption-scroll min-h-[140px] max-h-[280px] space-y-2"
        dir={dir}
      >
        {captions.length === 0 ? (
          <p className="text-slate-500 text-sm italic">
            Captions will appear here...
          </p>
        ) : (
          captions.map((cap) => (
            <p
              key={cap.id}
              className={clsx(
                'text-base leading-relaxed transition-opacity',
                cap.isFinal
                  ? 'text-white opacity-100'
                  : 'text-slate-300 opacity-75',
              )}
            >
              {cap.text}
            </p>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
