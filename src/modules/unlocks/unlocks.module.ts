import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UnlocksController } from './unlocks.controller';
import { UnlocksService } from './unlocks.service';
import { StoryUnlock, StoryUnlockSchema } from './schemas/story-unlock.schema';
import { Story, StorySchema } from '../stories/schemas/story.schema';
import { UsersModule } from '../users/users.module';

/**
 * Entitlement modülü — bağımlılık yönü tek yönlüdür:
 *   UnlocksModule ← StoriesModule, MultiplayerModule
 * StoriesService'e DEĞİL doğrudan Story modeline bağlanır; böylece StoriesModule
 * bu modülü `forwardRef` olmadan import edebilir.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StoryUnlock.name, schema: StoryUnlockSchema },
      { name: Story.name, schema: StorySchema },
    ]),
    UsersModule,
  ],
  controllers: [UnlocksController],
  providers: [UnlocksService],
  exports: [UnlocksService],
})
export class UnlocksModule {}
