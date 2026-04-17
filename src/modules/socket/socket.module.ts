import { Module, forwardRef } from '@nestjs/common';
import { AppGateway } from './app.gateway';
import { PresenceModule } from '../presence/presence.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { MultiplayerModule } from '../multiplayer/multiplayer.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PresenceModule,
    MatchmakingModule,
    forwardRef(() => MultiplayerModule),
    AuthModule,
  ],
  providers: [AppGateway],
  exports: [AppGateway],
})
export class SocketModule {}
