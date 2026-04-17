import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Admin route'larını x-admin-secret header ile korur.
 * @Public() decorator ile birlikte kullanılır — JWT bypass edilir
 * ancak admin secret kontrolü devreye girer.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const adminSecret = this.configService.get<string>('ADMIN_SECRET');
    const headerSecret = request.headers['x-admin-secret'];

    if (!adminSecret || !headerSecret || headerSecret !== adminSecret) {
      throw new ForbiddenException('Invalid admin credentials');
    }

    return true;
  }
}
