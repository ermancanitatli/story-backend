import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MultiplayerController } from './multiplayer.controller';
import { MultiplayerService } from './multiplayer.service';
import { MultiplayerSession, MultiplayerSessionSchema } from './schemas/multiplayer-session.schema';
import { MultiplayerProgress, MultiplayerProgressSchema } from './schemas/multiplayer-progress.schema';
import { StoriesModule } from '../stories/stories.module';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';
import { SocketModule } from '../socket/socket.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MultiplayerSession.name, schema: MultiplayerSessionSchema },
      { name: MultiplayerProgress.name, schema: MultiplayerProgressSchema },
    ]),
    StoriesModule,
    AiModule,
    UsersModule,
    forwardRef(() => SocketModule),
  ],
  controllers: [MultiplayerController],
  providers: [MultiplayerService],
  exports: [MultiplayerService],
})
export class MultiplayerModule {}
