import { Module } from '@nestjs/common';
import { StorySessionsController } from './story-sessions.controller';

/**
 * Singleplayer modülü kaldırıldı — geriye sadece 410 Gone döndüren
 * tombstone controller kaldı. Service, DTO'lar ve Mongoose kaydı silindi.
 *
 * Şema dosyaları (schemas/story-session.schema.ts, schemas/story-progress.schema.ts)
 * korunuyor: StoriesModule ve PanelModule kendi MongooseModule.forFeature
 * kayıtlarını yapıp okuma amaçlı kullanıyor.
 */
@Module({
  controllers: [StorySessionsController],
})
export class StorySessionsModule {}
