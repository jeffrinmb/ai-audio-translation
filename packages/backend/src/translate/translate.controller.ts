import { Controller, Post, Body } from '@nestjs/common';
import { TranslateService } from './translate.service';

@Controller('translate')
export class TranslateController {
  constructor(private readonly translateService: TranslateService) {}

  @Post()
  async translate(
    @Body() body: { text: string; targetLang: string },
  ): Promise<{ translatedText: string }> {
    const translatedText = await this.translateService.translate(
      body.text,
      body.targetLang,
    );
    return { translatedText };
  }
}
