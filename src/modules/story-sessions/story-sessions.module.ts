import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StorySessionsController } from './story-sessions.controller';
import { StorySessionsService } from './story-sessions.service';
import { StorySession, StorySessionSchema } from './schemas/story-session.schema';
import { StoryProgress, StoryProgressSchema } from './schemas/story-progress.schema';
import { StoriesModule } from '../stories/stories.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StorySession.name, schema: StorySessionSchema },
      { name: StoryProgress.name, schema: StoryProgressSchema },
    ]),
    StoriesModule,
    AiModule,
  ],
  controllers: [StorySessionsController],
  providers: [StorySessionsService],
  exports: [StorySessionsService],
})
export class StorySessionsModule {}
