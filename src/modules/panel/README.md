# Admin Panel (NestJS)

Admin panel `views/panel/*.ejs` + EJS layout shell üzerine kurulu, session cookie tabanlı auth kullanır. REST API'larında kullanılan JWT auth'dan TAMAMEN AYRI çalışır.

- **Session cookie:** `panel.sid` (express-session + connect-redis / RedisStore)
- **Session payload:** `{ adminId, username, cookie }`
- **Login endpoint:** `POST /panel/login`
- **Logout endpoint:** `POST /panel/logout`
- **Layout shell:** `views/panel/layout.ejs` (sidebar + header + toast container)

---

## 1. Guards

### SessionAuthGuard (`./guards/session-auth.guard.ts`)

- `@Controller('panel')` altındaki tüm endpoint'lere uygulanır (`@UseGuards(SessionAuthGuard)`).
- `req.session.adminId` yoksa ve handler/class `@PanelPublic()` ile işaretlenmemişse:
  - HTML isteklerinde `/panel/login`'e **302 redirect** döner.
  - (API endpoint'leri şu an aynı guard altında; 401 dönmesi gerekiyorsa handler seviyesinde farklı davranış eklenebilir.)
- `Reflector` ile `PANEL_PUBLIC_KEY` metadata'sını hem handler hem class seviyesinden okur.

### JwtAuthGuard (`src/common/guards/jwt-auth.guard.ts`)

- Mobile/REST API için global guard (`APP_GUARD` olarak `AppModule`'da register).
- `@Public()` ile bypass edilir.
- Banned/deleted user kontrolü içerir (USER-04).
- **Panel endpoint'lerini ETKİLEMEZ** çünkü `PanelController` class-level `@Public()` taşır.

### BroadcastRateLimitGuard (`../notifications/guards/broadcast-rate-limit.guard.ts`)

- Sadece broadcast push gönderimi için Redis lock (5 dk cooldown).
- Panel'in geri kalanıyla ilgisi yok.

---

## 2. Decorators

### `@Public()` — `src/common/decorators/public.decorator.ts`

Global `JwtAuthGuard`'ı bypass eder. Panel controller'larında **class-level** kullanılır — böylece JWT guard panel rotalarını reddetmesin (panel session-based auth kullanıyor, JWT token göndermiyor).

### `@PanelPublic()` — `./decorators/panel-public.decorator.ts`

`SessionAuthGuard`'ı bypass eder. Kullanım yerleri:

- `GET /panel/login` — login sayfası (anonim erişim)
- `POST /panel/login` — login form submit
- İleride eklenecek public panel endpoint'leri (örn. health, catch-all fallback)

### Kombinasyon örneği (`panel.controller.ts`)

```ts
@Controller('panel')
@Public()                     // JWT guard bypass (mobil API için olan)
@UseGuards(SessionAuthGuard)  // Panel session zorunlu
@UseFilters(PanelHtmlExceptionFilter)
export class PanelController {
  @Get('login')
  @PanelPublic()              // Session da bypass — login sayfası herkese açık
  showLogin(...) { ... }

  @Get()
  dashboard(...) { ... }      // Session zorunlu (varsayılan)
}
```

### `@AuditAction(...)` + `@AuditResource(...)` — `./decorators/audit-action.decorator.ts`

Panel mutation handler'ları için. `AuditInterceptor` bu metadata'yı okuyup başarılı isteklerde `admin_audit_logs` koleksiyonuna kayıt atar.

```ts
@Post('users/:id/ban')
@AuditAction('ban')
@AuditResource('user')
async banUser(...) { ... }
```

---

## 3. Yeni Panel Sayfası Ekleme (Checklist)

`/panel/foo` route'u eklemek istiyorsun. Adımlar:

### 3.1 Controller handler

`panel.controller.ts` içine (veya yeni bir controller açıp `PanelModule`'a kaydederek):

```ts
@Get('foo')
showFoo(
  @Req() req: Request & { session: PanelSession },
  @Res() res: Response,
) {
  return res.render('panel/foo', {
    title: 'Foo',
    currentPath: req.path,
    username: req.session?.username || 'Admin',
    breadcrumbs: [{ label: 'Foo' }],
  });
}
```

Not: `@Controller('panel')` class-level guard'lar zaten session auth'u sağlıyor; ayrıca `@UseGuards` gerekmez.

### 3.2 View dosyası

`views/panel/foo.ejs`:

```html
<% layout('panel/layout') -%>

<div class="kt-card">
  <div class="kt-card-content p-6">
    <h2 class="text-xl font-semibold mb-4">Foo Sayfası</h2>
    <p>İçerik burada.</p>
  </div>
</div>
```

### 3.3 Sidebar menü item

`views/panel/partials/sidebar.ejs` içine yeni bir menü satırı ekle:

```html
<a
  href="/panel/foo"
  class="kt-menu-link <%= currentPath === '/panel/foo' ? 'kt-menu-link-active' : '' %>"
>
  <span class="kt-menu-icon"><i class="ki-outline ki-abstract-26"></i></span>
  <span class="kt-menu-title">Foo</span>
</a>
```

Aktif highlight için mutlaka `currentPath` render payload'da geçilmeli.

### 3.4 currentPath payload

**Her panel render çağrısında** `currentPath: req.path` ekle. Sidebar aktif item highlight'ı buna bağlı.

### 3.5 Client JS (opsiyonel)

`public/panel-assets/js/foo.js`:

```js
(function () {
  const btn = document.getElementById('foo-action');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      const res = await window.panelApi.post('/panel/api/foo', { bar: 1 });
      window.panelToast.success('İşlem başarılı');
    } catch (e) {
      window.panelToast.error(e.message || 'Hata');
    }
  });
})();
```

Layout zaten `panel-api.js` + `panel-toast.js` + `panel-session.js` yüklüyor.

### 3.6 Audit log (mutation ise tavsiye)

```ts
@Post('foo/:id')
@AuditAction('update')
@AuditResource('foo')
async updateFoo(@Param('id') id: string, ...) { ... }
```

### 3.7 Test checklist

- [ ] `/panel/login` üzerinden giriş sonrası `/panel/foo` açılıyor mu?
- [ ] Giriş yapmadan `/panel/foo` isteği `/panel/login`'e redirect ediyor mu?
- [ ] Sidebar'da Foo menü item'ı aktif highlight alıyor mu (`kt-menu-link-active`)?
- [ ] Logout sonrası tekrar login gerekiyor mu?
- [ ] Mutation handler varsa `admin_audit_logs`'ta kayıt oluşuyor mu?

---

## 4. Error Handling

- **Panel HTML route'ları:** `PanelHtmlExceptionFilter` — `views/panel/404.ejs` ve `views/panel/500.ejs` render eder. `PanelController` class-level `@UseFilters(PanelHtmlExceptionFilter)` taşır.
- **Mobile/REST API:** `ApiJsonExceptionFilter` — `{ error: { code, message, requestId } }` JSON formatında döner.

İkisi birbirini etkilemez; panel kırıldığında API, API kırıldığında panel çalışmaya devam eder.
