import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { existsSync } from 'fs';
import { EventsModule } from './events/events.module';
import { LiveKitModule } from './livekit/livekit.module';
import { TranslateModule } from './translate/translate.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), '..', '..', '.env'),   // monorepo root when cwd=packages/backend
        join(process.cwd(), '.env'),                // fallback: .env next to package
      ].filter(existsSync),
    }),
    LiveKitModule,
    EventsModule,
    TranslateModule,
  ],
})
export class AppModule {}
