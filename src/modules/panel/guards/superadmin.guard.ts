import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AdminUsersService } from '../admin-users.service';

/**
 * Kontrol edilen endpoint'e erişmek için aktif superadmin oturumu gerektirir.
 * SessionAuthGuard'dan SONRA çalıştığı varsayılır (session.adminId mevcut olmalı).
 */
@Injectable()
export class SuperadminGuard implements CanActivate {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<any>();
    const adminId = req.session?.adminId;
    if (!adminId) {
      throw new ForbiddenException('Session gerekli');
    }
    const admin = await this.adminUsersService.findById(adminId);
    if (!admin || admin.role !== 'superadmin' || !admin.isActive) {
      throw new ForbiddenException('Superadmin yetkisi gerekli');
    }
    return true;
  }
}
