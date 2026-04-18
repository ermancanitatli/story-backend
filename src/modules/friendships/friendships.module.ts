import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FriendshipsController } from './friendships.controller';
import { FriendshipsService } from './friendships.service';
import { Friendship, FriendshipSchema } from './schemas/friendship.schema';
import { FriendRequest, FriendRequestSchema } from './schemas/friend-request.schema';
import { FriendAlert, FriendAlertSchema } from './schemas/friend-alert.schema';
import { UsersModule } from '../users/users.module';
import { SocketModule } from '../socket/socket.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Friendship.name, schema: FriendshipSchema },
      { name: FriendRequest.name, schema: FriendRequestSchema },
      { name: FriendAlert.name, schema: FriendAlertSchema },
    ]),
    UsersModule,
    forwardRef(() => SocketModule),
    NotificationModule,
  ],
  controllers: [FriendshipsController],
  providers: [FriendshipsService],
  exports: [FriendshipsService],
})
export class FriendshipsModule {}
