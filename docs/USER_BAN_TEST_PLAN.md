# User Ban Akışı — Manuel Test Planı

Kullanıcı banlama modülünün (USER-01...USER-22) uçtan uca doğrulanması için adım adım senaryolar.

## Ön Koşullar
- Backend prod veya staging'de çalışıyor.
- iOS app TestFlight/Dev build.
- Admin panel erişimi (superadmin veya admin rolü).
- Test kullanıcısı hazır (mobilden anonim login yapmış, ban yemek için).

## Senaryo 1: Admin Ban → Aktif Socket Kick

1. **İlk durum**: Test kullanıcısı iOS app'ten aktif (socket connected, `/users/me` çalışıyor).
2. **Ban**: Admin panelde `/panel/users` → kullanıcıyı bul → "Düzenle" → Moderasyon tab → "Ban" formu:
   - Reason: "test"
   - Süre: boş (permanent)
   - Kaydet
3. **Beklenti (iOS)**:
   - Anlık: Socket `auth:rejected` event'i alır → `AccountTerminatedView` gösterilir.
   - AuthManager `sessionTerminationReason` → `.accountBanned(until: nil)`.
4. **Beklenti (Backend)**:
   - `users` collection'da `isBanned:true, bannedAt:now, banReason:'test', bannedUntil:null`.
   - `admin_audit_logs` collection'da `action:'BAN'` satırı.
   - `refresh_tokens` collection'da user'a ait token'lar `revoked:true`.
   - Socket kick: kullanıcının tüm bağlantıları disconnect.

## Senaryo 2: App Restart → Anonymous Login Reddi

1. iOS app'i **kapat ve tekrar aç**.
2. `AuthManager.signInAnonymously` çağrılır (mevcut deviceId keychain'de).
3. **Beklenti**:
   - Backend `POST /auth/anonymous` → 403 `USER_BANNED` + bannedUntil.
   - APIClient error'ı yakalar → AuthManager.forceTerminate → `AccountTerminatedView`.

## Senaryo 3: Unban → Normal Akış

1. Admin panelde kullanıcıyı aç → Moderasyon tab → "Unban".
2. **Beklenti (DB)**: `isBanned:false, bannedAt:null, banReason:null, bannedUntil:null`. Audit `UNBAN`.
3. iOS'ta yeni login denemesi (app restart):
   - `POST /auth/anonymous` başarılı.
   - Normal akış devam.

## Senaryo 4: Süreli Ban Expire

1. Admin `until` alanına 2 dakika sonrası ISO tarih koy → ban.
2. iOS tarafı bloklu.
3. 2 dakika bekle.
4. iOS app restart → anonymous login:
   - **Beklenti**: 403 HALA dönüyor çünkü backend sadece `isBanned` flag'ine bakıyor — otomatik unban cron yok.
5. **Kararlaştırıldı**: Süreli ban expire için ayrı task gerekir (gelecek iterasyon).
   - Öneri: Login sırasında `if (user.isBanned && user.bannedUntil && user.bannedUntil < now)` → otomatik unban yap.
   - Şu an için süreli ban = manuel unban.

## Senaryo 5: Soft Delete

1. Admin panelde "Sil" aksiyonu (2-step confirm).
2. **Beklenti (DB)**: `isDeleted:true, deletedAt:now, anonymizedAt:now, email:null, userHandle:null, displayName:'Deleted User', photoURL:null`.
3. iOS socket `auth:rejected` + `USER_DELETED`.
4. `AccountTerminatedView` deleted variant gösterir.
5. App restart → anonymous login 410 `USER_DELETED`.

## Kontrol Listesi

- [ ] Senaryo 1: Aktif socket kick
- [ ] Senaryo 2: App restart ban reddi
- [ ] Senaryo 3: Unban normal akış
- [ ] Senaryo 4: Süreli ban expire (current behavior belgelendi)
- [ ] Senaryo 5: Soft delete akışı
- [ ] iOS `AccountTerminatedView` banned/deleted variant'ları görsel doğru
- [ ] Destek email linki (mailto:destek@storyapp.app) çalışıyor
- [ ] Audit log viewer'da tüm aksiyonlar listelenir

## Bilinen Sınırlamalar

- **Süreli ban auto-expire yok**: `bannedUntil` geçmişse bile kullanıcı manuel unban edilmeden giriş yapamaz.
- **Kaskad effect**: Silinen kullanıcının `friendships`, `story_sessions` kayıtları silinmez, sadece `users` doc'unda flag ve PII null'lanır.
- **Yeni deviceId ile yeniden kayıt**: Kullanıcı keychain silip yeni deviceId alırsa yeni user oluşturabilir — IP/device fingerprint kontrolü yok.
