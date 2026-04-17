import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingQueue, MatchmakingQueueSchema } from './schemas/matchmaking-queue.schema';
import { UsersModule } from '../users/users.module';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MatchmakingQueue.name, schema: MatchmakingQueueSchema }]),
    UsersModule,
    PresenceModule,
  ],
  providers: [MatchmakingService],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
