import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { PANEL_PUBLIC_KEY } from '../decorators/panel-public.decorator';

/**
 * /panel/* route'ları için session tabanlı koruma.
 * session.isAdmin yoksa /panel/login'e redirect eder.
 * @PanelPublic() decorator'ü ile bypass edilebilir.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PANEL_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { session: any }>();
    const res = context.switchToHttp().getResponse<Response>();

    if (req.session?.adminId) return true;

    res.redirect('/panel/login');
    return false;
  }
}
