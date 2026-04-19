# Production Readiness Checklist

Prod deploy öncesi manuel doğrulama. Ops ekibi tarafından koşulur.

## 1. HTTPS & Reverse Proxy
- [ ] `curl -I https://api.xtingmobile.com` → `strict-transport-security: max-age=…` header var.
- [ ] Cookie `Secure` flag'i DevTools Application tab'ında görünür.
- [ ] `app.set('trust proxy', 1)` main.ts'te aktif.

## 2. Session
- [ ] `SESSION_SECRET` env set ve 32+ karakter rastgele.
- [ ] Coolify volume mount `/.env` persist ediyor (redeploy sonrası session ayakta kalıyor).
- [ ] `panel.sid` cookie `HttpOnly + SameSite=Lax + Secure` prod'da.

## 3. MongoDB
- [ ] Replica set sağlıklı: `rs.status()` içinde `PRIMARY + SECONDARY`.
- [ ] Index'ler eksiksiz: `npm run verify:indexes` exit 0.
- [ ] Admin user seed kaldırıldı — sadece DB'de admin/şifre var, env'de yok.

## 4. Redis
- [ ] `REDIS_PASSWORD` set edilmiş, auth aktif.
- [ ] Session store erişilebilir (`redis-cli -a $PASS ping` → PONG).

## 5. CORS
- [ ] `CORS_ORIGIN` prod değerleri (`*` değil): `https://api.xtingmobile.com`, iOS app origin.

## 6. Admin Panel
- [ ] `admin_users` koleksiyonunda default parola yok (rotate edildi).
- [ ] `admin_audit_logs` TTL index aktif (365 gün).
- [ ] Rate limit test: 6. hatalı login 429 döndürüyor.
- [ ] 2FA (CC-16) deploy edildiyse aktif admin'lerde enrolled.

## 7. Observability
- [ ] `SENTRY_DSN` set, test event Sentry dashboard'a düşüyor.
- [ ] JSON log'lar Coolify log viewer'da parse ediliyor.

## 8. OneSignal
- [ ] `ONESIGNAL_APP_ID` + `ONESIGNAL_REST_API_KEY` set, backend boot'ta `🔔 OneSignal initialized` log.

## 9. iOS App
- [ ] En güncel build App Store/TestFlight'ta.
- [ ] Deeplink/Universal Links çalışıyor.
- [ ] Push token backend'e kaydediliyor (`users.oneSignalPlayerId`).

## 10. Smoke Test
- [ ] `/panel/login` → dashboard → logout akışı (PANEL-12 checklist).
- [ ] `/api/health` 200 + `services.mongodb: connected`.
