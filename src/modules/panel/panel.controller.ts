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
import { ChangePasswordDto } from './dto/change-password.dto';

type PanelSession = {
  adminId?: string;
  username?: string;
  save: (cb: (err: any) => void) => void;
  destroy: (cb: (err: any) => void) => void;
  touch: () => void;
  cookie: { maxAge?: number };
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
    @Query('passwordChanged') passwordChanged?: string,
  ) {
    if (req.session?.adminId) {
      return res.redirect('/panel');
    }
    return res.render('panel/login', {
      error: null,
      username: '',
      success:
        passwordChanged === '1'
          ? 'Şifreniz güncellendi. Yeni şifrenizle giriş yapın.'
          : null,
    });
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

  /**
   * Extend current panel session: touches the session so connect-redis
   * rewrites the TTL with the full cookie.maxAge, then returns the new
   * expiresAt (ISO) for the client to reschedule its warning modal.
   */
  @Post('api/session/extend')
  extendSession(
    @Req() req: Request & { session: PanelSession },
    @Res() res: Response,
  ) {
    req.session.touch();
    req.session.save((err) => {
      if (err) return res.status(500).json({ ok: false });
      const maxAge = req.session.cookie.maxAge || 0;
      res.json({
        ok: true,
        expiresAt: new Date(Date.now() + maxAge).toISOString(),
      });
    });
  }

  /**
   * Session metadata used by panel-session.js to schedule the
   * "session expiring soon" warning and drive the idle auto-logout.
   */
  @Get('api/session/meta')
  sessionMeta(
    @Req() req: Request & { session: PanelSession },
    @Res() res: Response,
  ) {
    const maxAge = req.session.cookie.maxAge || 0;
    res.json({
      expiresAt: new Date(Date.now() + maxAge).toISOString(),
      idleTimeoutMs: parseInt(
        process.env.IDLE_TIMEOUT_MS || String(10 * 60 * 1000),
        10,
      ),
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
  @Get('account/password')
  showPasswordForm(
    @Req() req: Request & { session: PanelSession },
    @Res() res: Response,
  ) {
    return res.render('panel/account/password', {
      title: 'Şifre Değiştir',
      breadcrumbs: [
        { label: 'Hesap', href: '/panel/account' },
        { label: 'Şifre' },
      ],
      currentPath: req.path,
      username: req.session?.username || 'Admin',
      error: null,
      success: null,
    });
  }

  @Post('account/password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request & { session: PanelSession },
    @Res() res: Response,
  ) {
    const renderBase = {
      title: 'Şifre Değiştir',
      breadcrumbs: [
        { label: 'Hesap', href: '/panel/account' },
        { label: 'Şifre' },
      ],
      currentPath: req.path,
      username: req.session?.username || 'Admin',
    };

    if (dto.newPassword !== dto.confirmPassword) {
      return res.render('panel/account/password', {
        ...renderBase,
        error: 'Yeni şifreler eşleşmiyor',
        success: null,
      });
    }

    const user = await this.adminUsersService.verify(
      req.session?.username || '',
      dto.currentPassword,
    );
    if (!user) {
      return res.render('panel/account/password', {
        ...renderBase,
        error: 'Mevcut şifre hatalı',
        success: null,
      });
    }

    await this.adminUsersService.changePassword(
      user._id.toString(),
      dto.newPassword,
    );

    try {
      await this.auditService.record({
        adminId: user._id.toString(),
        adminUsername: user.username,
        action: 'PASSWORD_CHANGE',
      });
    } catch {
      // audit log hatası password change'i engellemez
    }

    req.session.destroy(() => {
      res.clearCookie('panel.sid');
      res.redirect('/panel/login?passwordChanged=1');
    });
  }

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
