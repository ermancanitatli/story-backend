import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PanelController } from './panel.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminAuditLogService } from './admin-audit-log.service';
import { AdminUsersManagementService } from './admin-users-management.service';
import { AdminUser, AdminUserSchema } from './schemas/admin-user.schema';
import { AdminAuditLog, AdminAuditLogSchema } from './schemas/admin-audit-log.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: AdminUser.name, schema: AdminUserSchema },
      { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PanelController],
  providers: [AdminUsersService, AdminAuditLogService, AdminUsersManagementService],
  exports: [AdminUsersService, AdminAuditLogService, AdminUsersManagementService],
})
export class PanelModule {}
