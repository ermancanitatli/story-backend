import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Reflector } from '@nestjs/core';
import * as session from 'express-session';
import * as expressLayouts from 'express-ejs-layouts';
import { join } from 'path';
import { PanelController } from '../../src/modules/panel/panel.controller';
import { AdminUsersService } from '../../src/modules/panel/admin-users.service';
import { AdminAuditLogService } from '../../src/modules/panel/admin-audit-log.service';
import { SessionAuthGuard } from '../../src/modules/panel/guards/session-auth.guard';
import { PageViewInterceptor } from '../../src/modules/panel/interceptors/page-view.interceptor';
import { PanelHtmlExceptionFilter } from '../../src/common/filters/panel-html-exception.filter';
import { getModelToken } from '@nestjs/mongoose';
import { AdminPageView } from '../../src/modules/panel/schemas/admin-page-view.schema';

/**
 * Test app factory: isolates PanelController with mocked AdminUsersService /
 * AdminAuditLogService / mongoose models so we don't need MongoDB or Redis.
 *
 * In-memory express-session MemoryStore is used (default express-session
 * store when `store` option is omitted) — fine for single-process tests.
 */
export interface TestAppBundle {
  app: INestApplication;
  mockAdminUsersService: {
    verify: jest.Mock;
    findById: jest.Mock;
    changePassword: jest.Mock;
  };
  mockAuditService: { record: jest.Mock; list: jest.Mock; count: jest.Mock };
  mockPageViewModel: { create: jest.Mock; aggregate: jest.Mock };
}

export async function createTestApp(): Promise<TestAppBundle> {
  const mockAdminUsersService = {
    verify: jest.fn(),
    findById: jest.fn(),
    changePassword: jest.fn(),
  };
  const mockAuditService = {
    record: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };
  const mockPageViewModel = {
    create: jest.fn().mockResolvedValue({}),
    aggregate: jest.fn().mockResolvedValue([]),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [PanelController],
    providers: [
      Reflector,
      SessionAuthGuard,
      PageViewInterceptor,
      PanelHtmlExceptionFilter,
      { provide: AdminUsersService, useValue: mockAdminUsersService },
      { provide: AdminAuditLogService, useValue: mockAuditService },
      { provide: getModelToken(AdminPageView.name), useValue: mockPageViewModel },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();

  // EJS view engine so /panel/login can render the existing template.
  // dashboard.ejs uses `layout('panel/layout')` which requires the
  // express-ejs-layouts middleware (same setup as main.ts bootstrap).
  app.setBaseViewsDir(join(__dirname, '..', '..', 'views'));
  app.setViewEngine('ejs');
  app.use(expressLayouts);
  app.set('layout', false);

  // Minimal in-memory session middleware (MemoryStore)
  app.use(
    session({
      name: 'panel.sid',
      secret: 'test-secret-' + Date.now(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  );

  await app.init();
  return { app, mockAdminUsersService, mockAuditService, mockPageViewModel };
}
