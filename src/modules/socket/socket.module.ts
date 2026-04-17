import { Module, forwardRef } from '@nestjs/common';
import { AppGateway } from './app.gateway';
import { PresenceModule } from '../presence/presence.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { MultiplayerModule } from '../multiplayer/multiplayer.module';
import { AuthModule } from '../auth/auth.module';
import { FakeUsersModule } from '../fake-users/fake-users.module';

@Module({
  imports: [
    PresenceModule,
    MatchmakingModule,
    forwardRef(() => MultiplayerModule),
    AuthModule,
    forwardRef(() => FakeUsersModule),
  ],
  providers: [AppGateway],
  exports: [AppGateway],
})
export class SocketModule {}
