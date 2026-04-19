import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Render,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { PanelPublic } from './decorators/panel-public.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PanelHtmlExceptionFilter } from '../../common/filters/panel-html-exception.filter';
import { AdminUsersService } from './admin-users.service';
import { AdminAuditLogService } from './admin-audit-log.service';

type PanelSession = {
  adminId?: string;
  username?: string;
  save: (cb: (err: any) => void) => void;
  destroy: (cb: (err: any) => void) => void;
};

@Controller('panel')
@Public()
@UseGuards(SessionAuthGuard)
@UseFilters(PanelHtmlExceptionFilter)
export class PanelController {
  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly auditService: AdminAuditLogService,
  ) {}

  @Get('login')
  @PanelPublic()
  showLogin(
    @Req() req: Request & { session: PanelSession },
    @Res() res: Response,
  ) {
    if (req.session?.adminId) {
      return res.redirect('/panel');
    }
    return res.render('panel/login', { error: null, username: '' });
  }

  @Post('login')
  @PanelPublic()
  async submitLogin(
    @Body('username') username: string,
    @Body('password') password: string,
    @Req() req: Request & { session: PanelSession },
    @Res() res: Response,
  ) {
    const user = await this.adminUsersService.verify(username, password);
    if (!user) {
      return res.status(401).render('panel/login', {
        error: 'Kullanıcı adı veya şifre hatalı.',
        username: username || '',
      });
    }

    req.session.adminId = user._id.toString();
    req.session.username = user.username;
    req.session.save((err) => {
      if (err) {
        return res.status(500).render('panel/login', {
          error: 'Oturum kaydedilemedi, tekrar deneyin.',
          username: user.username,
        });
      }
      res.redirect('/panel');
    });
  }

  /**
   * Panel logout.
   * CSRF note: csurf (eski) vs @nestjs/csrf bu aşamada scope dışı.
   * SameSite=Lax cookie + POST-only endpoint bu use case için yeterli güvenlik sağlar.
   * İleride cross-origin form submit riski oluşursa CSRF middleware eklenebilir.
   * Hem header dropdown hem sidebar footer aynı endpoint'e POST form ile gönderir (tek source of truth).
   */
  @Post('logout')
  logout(
    @Req() req: Request & { session: PanelSession },
    @Res() res: Response,
  ) {
    req.session.destroy(() => {
      res.clearCookie('panel.sid');
      res.redirect('/panel/login');
    });
  }

  @Get()
  @Render('panel/dashboard')
  dashboard(@Req() req: Request & { session: PanelSession }) {
    return {
      title: 'Dashboard',
      username: req.session?.username || 'Admin',
      currentPath: req.path,
      breadcrumbs: [{ label: 'Dashboard' }],
    };
  }

  /**
   * Audit log viewer (paginated).
   * Şu an tüm giriş yapmış admin'ler erişebilir; CC-08'de SuperadminGuard ile kısıtlanacak.
   */
  @Get('audit')
  async showAudit(
    @Req() req: Request & { session: PanelSession },
    @Res() res: Response,
    @Query() query: any,
  ) {
    const limit = Math.min(
      Math.max(parseInt(query.limit || '25', 10) || 25, 1),
      100,
    );
    const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);

    const filter = {
      action: query.action || undefined,
      targetUserId: query.targetUserId || undefined,
      adminId: query.adminId || undefined,
    };

    const [logs, total] = await Promise.all([
      this.auditService.list(filter, limit, offset),
      this.auditService.count(filter),
    ]);

    return res.render('panel/audit/list', {
      logs,
      total,
      limit,
      offset,
      filter,
      currentPath: req.path,
      username: req.session?.username || 'Admin',
      title: 'Audit Log',
      breadcrumbs: [{ label: 'Audit' }],
    });
  }
}
