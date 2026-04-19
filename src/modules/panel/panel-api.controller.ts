import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { AdminUsersManagementService } from './admin-users-management.service';
import { AdminAuditLogService } from './admin-audit-log.service';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { BanUserDto } from './dto/ban-user.dto';

@Controller('panel/api')
@Public()
@UseGuards(SessionAuthGuard)
export class PanelApiController {
  constructor(
    private mgmt: AdminUsersManagementService,
    private audit: AdminAuditLogService,
  ) {}

  private actor(req: any) {
    return {
      adminId: req?.session?.adminId || 'unknown',
      adminUsername: req?.session?.username || 'unknown',
    };
  }

  @Get('users')
  async listUsers(@Query() query: any) {
    const toBool = (v: any) =>
      v === 'true' ? true : v === 'false' ? false : undefined;

    const filter: any = {
      search: query.search,
      isPremium: toBool(query.isPremium),
      isBanned: toBool(query.isBanned),
      isDeleted: toBool(query.isDeleted),
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    };

    return this.mgmt.listUsers(filter);
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return this.mgmt.getUserDetail(id);
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
    @Req() req: any,
  ) {
    return this.mgmt.updateUserByAdmin(id, dto, this.actor(req));
  }

  @Post('users/:id/ban')
  async banUser(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @Req() req: any,
  ) {
    return this.mgmt.banUser(id, dto, this.actor(req));
  }

  @Post('users/:id/unban')
  async unbanUser(@Param('id') id: string, @Req() req: any) {
    return this.mgmt.unbanUser(id, this.actor(req));
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Req() req: any) {
    const svc: any = this.mgmt;
    if (typeof svc.softDeleteUser === 'function') {
      return svc.softDeleteUser(id, this.actor(req));
    }
    throw new HttpException(
      'Soft delete not yet implemented (USER-11 pending)',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Get('audit-logs')
  async listAudit(@Query() query: any) {
    const limit = query.limit ? parseInt(query.limit, 10) : 100;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const filter = {
      action: query.action,
      targetUserId: query.targetUserId,
      adminId: query.adminId,
    };
    const [logs, total] = await Promise.all([
      this.audit.list(filter, limit, offset),
      this.audit.count(filter),
    ]);
    return { logs, total, limit, offset };
  }
}
