import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppGateway } from './app.gateway';
import { PresenceModule } from '../presence/presence.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { MultiplayerModule } from '../multiplayer/multiplayer.module';
import { AuthModule } from '../auth/auth.module';
import { FakeUsersModule } from '../fake-users/fake-users.module';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
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
