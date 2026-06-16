'use client';

import { LANGUAGES, type LanguageCode, type Language } from '@/lib/constants';
import clsx from 'clsx';

interface LanguageSelectorProps {
  selected: LanguageCode;
  onChange: (code: LanguageCode) => void;
  /** When true, English is included as an option (audience only) */
  includeEnglish?: boolean;
  label?: string;
}

/**
 * LanguageSelector renders a pill-button row for choosing a translation language.
 */
export function LanguageSelector({
  selected,
  onChange,
  includeEnglish = true,
  label,
}: LanguageSelectorProps) {
  const options = includeEnglish
    ? LANGUAGES
    : LANGUAGES.filter((l) => l.code !== 'en');

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((lang: Language) => (
          <button
            key={lang.code}
            onClick={() => onChange(lang.code)}
            className={clsx(
              'px-4 py-2 rounded-full text-sm font-medium transition-all duration-150',
              selected === lang.code
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white',
            )}
          >
            <span className="mr-1.5">{lang.nativeName}</span>
            <span className="opacity-60 text-xs">({lang.name})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
