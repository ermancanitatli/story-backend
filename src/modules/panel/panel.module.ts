import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PanelController } from './panel.controller';
import { PanelNotificationsController } from './panel-notifications.controller';
import { PanelApiController } from './panel-api.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminAuditLogService } from './admin-audit-log.service';
import { AdminUsersManagementService } from './admin-users-management.service';
import { AdminUser, AdminUserSchema } from './schemas/admin-user.schema';
import { AdminAuditLog, AdminAuditLogSchema } from './schemas/admin-audit-log.schema';
import { AdminPageView, AdminPageViewSchema } from './schemas/admin-page-view.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Friendship, FriendshipSchema } from '../friendships/schemas/friendship.schema';
import { StorySession, StorySessionSchema } from '../story-sessions/schemas/story-session.schema';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { PageViewInterceptor } from './interceptors/page-view.interceptor';
import { SocketModule } from '../socket/socket.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: AdminUser.name, schema: AdminUserSchema },
      { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
      { name: AdminPageView.name, schema: AdminPageViewSchema },
      { name: User.name, schema: UserSchema },
      { name: Friendship.name, schema: FriendshipSchema },
      { name: StorySession.name, schema: StorySessionSchema },
    ]),
    forwardRef(() => SocketModule),
    NotificationModule,
  ],
  controllers: [PanelController, PanelNotificationsController, PanelApiController],
  providers: [
    AdminUsersService,
    AdminAuditLogService,
    AdminUsersManagementService,
    AuditInterceptor,
    PageViewInterceptor,
  ],
  exports: [
    AdminUsersService,
    AdminAuditLogService,
    AdminUsersManagementService,
    AuditInterceptor,
  ],
})
export class PanelModule {}
