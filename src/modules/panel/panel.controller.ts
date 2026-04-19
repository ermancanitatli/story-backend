import {
  Body,
  Controller,
  Get,
  Post,
  Render,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Req } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { PanelPublic } from './decorators/panel-public.decorator';
import { Public } from '../../common/decorators/public.decorator';

type PanelSession = { isAdmin?: boolean };

@Controller('panel')
@Public()
@UseGuards(SessionAuthGuard)
export class PanelController {
  constructor(private readonly configService: ConfigService) {}

  @Get('login')
  @PanelPublic()
  @Render('panel/login')
  showLogin(@Req() req: Request & { session: PanelSession }) {
    if (req.session?.isAdmin === true) {
      return { redirect: '/panel' };
    }
    return { error: null };
  }

  @Post('login')
  @PanelPublic()
  async submitLogin(
    @Body('password') password: string,
    @Req() req: Request & { session: PanelSession & { save: (cb: (err: any) => void) => void } },
    @Res() res: Response,
  ) {
    const expected = this.configService.get<string>('ADMIN_PASSWORD') || '';
    if (!expected) {
      return res.status(500).render('panel/login', {
        error: 'Sunucu yapılandırma hatası: ADMIN_PASSWORD tanımlı değil.',
      });
    }

    if (!password || !this.constantTimeEquals(password, expected)) {
      return res.status(401).render('panel/login', { error: 'Şifre hatalı.' });
    }

    req.session.isAdmin = true;
    req.session.save((err) => {
      if (err) {
        return res.status(500).render('panel/login', {
          error: 'Oturum kaydedilemedi, tekrar deneyin.',
        });
      }
      res.redirect('/panel');
    });
  }

  @Post('logout')
  logout(
    @Req() req: Request & { session: { destroy: (cb: (err: any) => void) => void } },
    @Res() res: Response,
  ) {
    req.session.destroy(() => {
      res.clearCookie('panel.sid');
      res.redirect('/panel/login');
    });
  }

  @Get()
  @Render('panel/dashboard')
  dashboard() {
    return { title: 'Panel' };
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // timingSafeEqual aynı uzunluk ister; sabit-maliyetli dummy karşılaştırma
      timingSafeEqual(Buffer.alloc(bufB.length), Buffer.alloc(bufB.length));
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
