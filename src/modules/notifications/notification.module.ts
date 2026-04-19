import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationService } from './notification.service';
import { NotificationHistoryService } from './notification-history.service';
import { UserSegmentationService } from './user-segmentation.service';
import {
  NotificationHistory,
  NotificationHistorySchema,
} from './schemas/notification-history.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: NotificationHistory.name, schema: NotificationHistorySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [
    NotificationService,
    NotificationHistoryService,
    UserSegmentationService,
  ],
  exports: [
    NotificationService,
    NotificationHistoryService,
    UserSegmentationService,
  ],
})
export class NotificationModule {}
