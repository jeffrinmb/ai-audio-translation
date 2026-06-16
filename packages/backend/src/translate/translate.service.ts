import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const LANG_NAMES: Record<string, string> = {
  hi: 'Hindi',
  fr: 'French',
  ar: 'Arabic',
  ja: 'Japanese',
};

@Injectable()
export class TranslateService {
  private readonly apiKey: string;
  private lastCallAt = 0;
  private readonly MIN_INTERVAL_MS = 500;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY') ?? '';
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = this.MIN_INTERVAL_MS - (now - this.lastCallAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCallAt = Date.now();
  }

  async translate(text: string, targetLang: string): Promise<string> {
    await this.throttle();
    const langName = LANG_NAMES[targetLang] ?? targetLang;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${this.apiKey}`;

    const body = {
      contents: [
        {
          parts: [
            {
              text: `You are a translator. Translate this English text to ${langName}. Output the translation only, no explanations, no quotes:\n${text}`,
            },
          ],
        },
      ],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[TranslateService] Gemini ${res.status}:`, errBody.slice(0, 200));
      throw new Error(`Gemini translate error: ${res.status}`);
    }

    const data = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? text;
    return translated;
  }
}
