import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { BroadcastRateLimitGuard } from './guards/broadcast-rate-limit.guard';
import { createRedisClient } from '../../config/redis.config';

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
    {
      provide: 'REDIS_CLIENT',
      useFactory: (config: ConfigService) => createRedisClient(config),
      inject: [ConfigService],
    },
    BroadcastRateLimitGuard,
  ],
  exports: [
    NotificationService,
    NotificationHistoryService,
    UserSegmentationService,
    BroadcastRateLimitGuard,
  ],
})
export class NotificationModule {}
