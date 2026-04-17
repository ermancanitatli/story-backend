import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MatchmakingGateway } from './matchmaking.gateway';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingQueue, MatchmakingQueueSchema } from './schemas/matchmaking-queue.schema';
import { UsersModule } from '../users/users.module';
import { PresenceModule } from '../presence/presence.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MatchmakingQueue.name, schema: MatchmakingQueueSchema }]),
    UsersModule,
    PresenceModule,
    AuthModule,
  ],
  providers: [MatchmakingGateway, MatchmakingService],
  exports: [MatchmakingService, MatchmakingGateway],
})
export class MatchmakingModule {}
