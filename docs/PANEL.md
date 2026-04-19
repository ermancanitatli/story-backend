# Admin Panel — Teknik Referans

Story backend'e gömülü NestJS + EJS + KTUI admin panel. Mobile API'dan tamamen izole (ayrı auth, ayrı guard'lar).

## Route Haritası

| Rota | Method | Auth | Açıklama |
|------|--------|------|----------|
| `/panel/login` | GET | — | Login sayfası (HTML) |
| `/panel/login` | POST | — | Oturum başlat (rate limited 5/15dk) |
| `/panel/logout` | POST | session | Oturum sonlandır |
| `/panel` | GET | session | Dashboard |
| `/panel/users` | GET | session | Kullanıcı listesi |
| `/panel/stories` | GET | session | Hikaye listesi |
| `/panel/notifications` | GET | session | Bildirim composer |
| `/panel/notifications/history` | GET | session | Gönderim geçmişi |
| `/panel/audit` | GET | session | Audit log viewer |
| `/panel/account/password` | GET/POST | session | Şifre değiştir |
| `/panel/api/*` | * | session | JSON endpoint'ler |
| `/panel/api/session/extend` | POST | session | Session TTL uzat |
| `/panel/api/session/meta` | GET | session | Session meta |

## Guards

- **SessionAuthGuard** (`src/modules/panel/guards/session-auth.guard.ts`): `req.session.adminId` yoksa login'e redirect.
- **@PanelPublic()** decorator: SessionAuthGuard bypass (login/logout için).
- **@Public()** decorator: Global JwtAuthGuard bypass (panel → JWT'siz).
- **BroadcastRateLimitGuard**: Sadece notification send endpoint'i için Redis-backed 5dk lock.

## Env Değişkenleri

`.env.example` referans. Panel-specific olanlar:
- `SESSION_SECRET`: Express-session imza anahtarı. Production'da rotate edilirse tüm session'lar invalide olur.
- `IDLE_TIMEOUT_MS`: Idle logout süresi (default 10 dk).
- `PANEL_RATE_LIMIT_MAX` / `PANEL_RATE_LIMIT_WINDOW_MS`: Login brute-force limiti.
- `AUDIT_TTL_DAYS`: admin_audit_logs collection TTL.

## Yeni Panel Sayfası Nasıl Eklenir

1. Controller'da handler ekle:
```ts
@Get('foo')
@UseGuards(SessionAuthGuard)
showFoo(@Req() req, @Res() res) {
  return res.render('panel/foo', {
    title: 'Foo',
    currentPath: req.path,
    username: req.session?.username,
    breadcrumbs: [{ label: 'Foo' }],
  });
}
```

2. View: `views/panel/foo.ejs`:
```html
<% layout('panel/layout') %>
<h1>Foo</h1>
```

3. Sidebar menü item: `views/panel/partials/sidebar.ejs`.
4. (Opsiyonel) JS: `public/panel-assets/js/foo.js`. `window.panelApi` ve `window.panelToast` kullan.
5. (Opsiyonel) Audit: `@AuditAction('update') @AuditResource('foo')`.

## İndexler

- `users`: `{userHandle}` unique, `{email}` sparse, `{isBanned}`, `{isDeleted}`.
- `stories`: `{isPublished, genre, createdAt}` compound, `{tags}` multikey.
- `admin_audit_logs`: `{targetUserId, createdAt}`, `{action, createdAt}`, TTL on `createdAt` (365 gün).
- `admin_page_views`: TTL 90 gün.

Bakım: `npm run verify:indexes` — expected vs actual karşılaştırma.

## Error Handling

- `PanelHtmlExceptionFilter`: 404→`panel/404.ejs`, 5xx→`panel/500.ejs`, diğer→`panel/error.ejs`.
- `ApiJsonExceptionFilter`: `/panel/api/*` için `{error: {code, message, requestId}}`.
- Error code'lar: `src/common/filters/error-codes.ts` ve `docs/API_ERROR_CODES.md`.

## Observability

- CC-01 request-id middleware: her response X-Request-Id header'ı + JSON log'da reqId.
- CC-17 Sentry (opsiyonel): `SENTRY_DSN` set edilirse.

## Performance Audit

### N+1 Query Audit

Panel list endpoint'leri her request'te max 3 Mongo query yapmalı.

Audit script:
```bash
npm run panel:profile
```

Mevcut durum (2026-04-19):
| Endpoint | Query Count | Durum |
|----------|-------------|-------|
| `/panel/api/users` | 2 (find + count) | ✅ OK |
| `/panel/api/stories` | 2 (find + count) | ✅ OK |
| `/panel/api/notifications/history` | 1 (find) | ✅ OK |
| `/panel/api/audit-logs` | 2 (find + count) | ✅ OK |
| `/panel/api/users/:id` | 4 (user + friendships + sessions + count) | ⚠️ Sınırda — getUserDetail parallel Promise.all kullanıyor, I/O paralel |

Liste endpoint'leri `populate()` kullanmıyor, N+1 yok. Detail endpoint parallel promise ile 4 query yapıyor ama sequential olmadığından kabul edilebilir.
