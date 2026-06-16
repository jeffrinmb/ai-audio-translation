/**
 * Supported languages for translation.
 * Used throughout the speaker and audience UIs.
 */
export type LanguageCode = 'en' | 'hi' | 'fr' | 'ar' | 'ja';
export type TargetLanguageCode = 'hi' | 'fr' | 'ar' | 'ja';

export interface Language {
  code: LanguageCode;
  name: string;
  nativeName: string;
  /** LiveKit audio track name for this language */
  audioTrack: string;
  /** LiveKit data track topic for captions */
  captionTopic: string;
  /** Text direction for caption rendering */
  dir: 'ltr' | 'rtl';
}

export const LANGUAGES: Language[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    audioTrack: 'audio_en',
    captionTopic: 'caption_en',
    dir: 'ltr',
  },
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    audioTrack: 'audio_hi',
    captionTopic: 'caption_hi',
    dir: 'ltr',
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    audioTrack: 'audio_fr',
    captionTopic: 'caption_fr',
    dir: 'ltr',
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    audioTrack: 'audio_ar',
    captionTopic: 'caption_ar',
    dir: 'rtl',
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    audioTrack: 'audio_ja',
    captionTopic: 'caption_ja',
    dir: 'ltr',
  },
];

export const LANGUAGE_MAP: Record<LanguageCode, Language> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l]),
) as Record<LanguageCode, Language>;

export const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? '';
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';

if (typeof window !== 'undefined' && !LIVEKIT_URL) {
  console.error(
    '[Config] NEXT_PUBLIC_LIVEKIT_URL is not set. ' +
    'Add it to packages/frontend/.env.local and restart the dev server.',
  );
}
