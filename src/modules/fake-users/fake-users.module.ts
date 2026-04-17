import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FakeUsersController } from './fake-users.controller';
import { FakeUsersService } from './fake-users.service';
import { FakeMatchScheduler } from './fake-match.scheduler';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { UsersModule } from '../users/users.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { MultiplayerModule } from '../multiplayer/multiplayer.module';
import { UserHandlesModule } from '../user-handles/user-handles.module';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MatchmakingModule,
    UsersModule,
    AppSettingsModule,
    MultiplayerModule,
    UserHandlesModule,
  ],
  controllers: [FakeUsersController],
  providers: [FakeUsersService, FakeMatchScheduler],
  exports: [FakeUsersService],
})
export class FakeUsersModule {}
