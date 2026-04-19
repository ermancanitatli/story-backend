import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationService } from './notification.service';
import { NotificationHistoryService } from './notification-history.service';
import {
  NotificationHistory,
  NotificationHistorySchema,
} from './schemas/notification-history.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: NotificationHistory.name, schema: NotificationHistorySchema },
    ]),
  ],
  providers: [NotificationService, NotificationHistoryService],
  exports: [NotificationService, NotificationHistoryService],
})
export class NotificationModule {}
