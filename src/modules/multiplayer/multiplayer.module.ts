import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MultiplayerController } from './multiplayer.controller';
import { MultiplayerService } from './multiplayer.service';
import { StoryVoteService } from './story-vote.service';
import { MultiplayerReminderScheduler } from './multiplayer-reminder.scheduler';
import { MultiplayerSession, MultiplayerSessionSchema } from './schemas/multiplayer-session.schema';
import { MultiplayerProgress, MultiplayerProgressSchema } from './schemas/multiplayer-progress.schema';
import { StoriesModule } from '../stories/stories.module';
import { UnlocksModule } from '../unlocks/unlocks.module';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';
import { SocketModule } from '../socket/socket.module';
import { FakeUsersModule } from '../fake-users/fake-users.module';
import { PresenceModule } from '../presence/presence.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MultiplayerSession.name, schema: MultiplayerSessionSchema },
      { name: MultiplayerProgress.name, schema: MultiplayerProgressSchema },
    ]),
    StoriesModule,
    UnlocksModule,
    AiModule,
    UsersModule,
    PresenceModule,
    NotificationModule,
    forwardRef(() => SocketModule),
    forwardRef(() => FakeUsersModule),
  ],
  controllers: [MultiplayerController],
  providers: [MultiplayerService, StoryVoteService, MultiplayerReminderScheduler],
  exports: [MultiplayerService, StoryVoteService],
})
export class MultiplayerModule {}
