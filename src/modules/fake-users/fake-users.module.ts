import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FakeUsersController } from './fake-users.controller';
import { FakeUsersService } from './fake-users.service';
import { FakeMatchScheduler } from './fake-match.scheduler';
import { FakeMatchOrchestrator } from './fake-match-orchestrator.service';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { UsersModule } from '../users/users.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { MultiplayerModule } from '../multiplayer/multiplayer.module';
import { UserHandlesModule } from '../user-handles/user-handles.module';
import { SocketModule } from '../socket/socket.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  MatchmakingQueue,
  MatchmakingQueueSchema,
} from '../matchmaking/schemas/matchmaking-queue.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: MatchmakingQueue.name, schema: MatchmakingQueueSchema },
    ]),
    MatchmakingModule,
    UsersModule,
    AppSettingsModule,
    forwardRef(() => MultiplayerModule),
    UserHandlesModule,
    forwardRef(() => SocketModule),
  ],
  controllers: [FakeUsersController],
  providers: [FakeUsersService, FakeMatchScheduler, FakeMatchOrchestrator],
  exports: [FakeUsersService, FakeMatchOrchestrator],
})
export class FakeUsersModule {}
