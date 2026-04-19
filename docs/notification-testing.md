# Notification Modülü — E2E Manuel Test Planı

OneSignal entegrasyonu, segment yönetimi, history ve rate limit mekanizmalarının uçtan uca doğrulanması.

## Ön Koşullar
- Backend prod/staging'de çalışıyor.
- OneSignal dashboard erişimi (App ID: `fc4ddaeb-7f81-4fc1-8e2d-70ee8be119fd`).
- iOS TestFlight build (OneSignal player ID backend'e kayıtlı).
- Admin panel erişimi.

## Senaryo 1: Custom User ID → Deep Link Tıklama

**Adımlar:**
1. iOS app'te login ol, `users/me` response'undan `_id`'i not al.
2. Admin panel `/panel/notifications` aç.
3. Segment: "Özel kullanıcı ID'leri" seç, textarea'ya kendi user ID'ni yaz.
4. EN + TR başlık/içerik doldur.
5. Deep link URL: `storyapp://story/<storyId>` (veya test URL).
6. "Gönder" → confirm.

**Beklenti:**
- iOS cihazda push notification 1-2 saniye içinde gelir.
- Tıklanınca `OneSignalClickHandler` tetiklenir ve deep link işlenir.
- Panel history'de `sent` status + recipient count 1.

## Senaryo 2: non_premium Segment Count Doğrulama

**Adımlar:**
1. MongoDB'ye bağlan: `mongosh "mongodb://..."` (tunnel ile).
2. Manuel sorgu:
```js
db.users.countDocuments({
  'premium.isPremium': { $ne: true },
  oneSignalPlayerId: { $exists: true, $ne: null },
  isBanned: { $ne: true },
  isDeleted: { $ne: true }
})
```
3. Panel'de "Premium olmayan" segment seç, estimate sayısını karşılaştır.

**Beklenti:** Estimate = Manuel sorgu sonucu. ±%1 tolerans kabul (Redis cache 30s).

## Senaryo 3: Rate Limit (Cooldown)

**Adımlar:**
1. Panel'den bir broadcast gönder.
2. Hemen ardından (5 dk geçmeden) ikinci bir gönderim dene.

**Beklenti:** İkinci istek 429 Too Many Requests + `retryAfter` saniye. UI "Yayın gönderim bekleme süresi" göstermeli.

## Senaryo 4: Multilingual Heading

**Adımlar:**
1. iOS cihazda sistem dilini Türkçe yap.
2. Panel'den: headings `{en: "Hello", tr: "Merhaba"}`, contents `{en: "Test", tr: "Deneme"}` gönder.

**Beklenti:** iOS cihazda başlık "Merhaba", içerik "Deneme". English cihazda "Hello/Test".

## Senaryo 5: History Accuracy

**Adımlar:**
1. Panel'den bir gönderim yap.
2. `/panel/notifications/history` aç.

**Beklenti:**
- En üstte yeni gönderim.
- `status: sent`, `recipients: <count>`.
- Detay drawer'da raw OneSignal response görünür (`oneSignalNotificationId` valid UUID).
- `senderUsername` current admin.

## Senaryo 6: Scheduled Notification (NOTIF-14)

**Adımlar:**
1. Panel'den send endpoint'e `sendAt: <future ISO>` body ile gönder.
2. History'de `status: pending`, `scheduledFor` alan görünür.
3. `DELETE /panel/api/notifications/history/:id` çağır.

**Beklenti:** OneSignal DELETE 200, history `status: cancelled`.

## Senaryo 7: RevenueCat Tag Sync

**Adımlar:**
1. Test user non_premium iken estimate al.
2. Sandbox purchase (RevenueCat test) ile premium'a yükselt.
3. Webhook gelir, OneSignal tag `premium=true` set.
4. Estimate tekrar al (Redis cache 30s bekle).

**Beklenti:** non_premium count 1 azalır, premium count 1 artar.

## Kontrol Listesi

- [ ] Senaryo 1: Deep link tıklama
- [ ] Senaryo 2: non_premium count doğrulama
- [ ] Senaryo 3: Rate limit 429
- [ ] Senaryo 4: Multilingual locale switch
- [ ] Senaryo 5: History render accuracy
- [ ] Senaryo 6: Scheduled + cancel
- [ ] Senaryo 7: RevenueCat tag sync

## Bilinen Sınırlamalar

- **`include_aliases` v2 API** — OneSignal dashboard'da external_id mapping doğru görünmeli. Yanlışsa iOS `OneSignal.login(userId)` çağrısı yapılıyor mu kontrol et.
- **OneSignal free tier**: 10K external_id limit per broadcast. >10K user'da batch'e bölünür.
- **Tag sync gecikmesi**: RevenueCat webhook → OneSignal tag update async, 1-5 saniye gecikme olabilir. Estimate hatalı gelirse Mongo query'sine güven.
