import { Module } from '@nestjs/common';
import { TranslationService } from './translation.service';

@Module({
  providers: [TranslationService],
})
export class TranslationModule {}
