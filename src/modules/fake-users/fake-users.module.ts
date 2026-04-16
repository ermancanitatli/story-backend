import { Module } from '@nestjs/common';
import { FakeUsersService } from './fake-users.service';
import { FakeMatchScheduler } from './fake-match.scheduler';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { UsersModule } from '../users/users.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { MultiplayerModule } from '../multiplayer/multiplayer.module';

@Module({
  imports: [MatchmakingModule, UsersModule, AppSettingsModule, MultiplayerModule],
  providers: [FakeUsersService, FakeMatchScheduler],
  exports: [FakeUsersService],
})
export class FakeUsersModule {}
