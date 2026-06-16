import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { existsSync } from 'fs';
import { TranslationModule } from './translation/translation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), '..', '..', '.env'),   // monorepo root when cwd=packages/worker
        join(process.cwd(), '.env'),                // fallback: .env next to package
      ].filter(existsSync),
    }),
    ScheduleModule.forRoot(),
    TranslationModule,
  ],
})
export class AppModule {}
