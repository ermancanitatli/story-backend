# Panel Stories CRUD — Manuel E2E Test Checklist

Admin panel hikaye yönetim modülünün (STORY-01..22) uçtan uca doğrulanması.

## Ön Koşullar
- Backend prod/staging'de çalışıyor.
- Admin panel erişimi (`admin / Dede21erot_*`).
- iOS TestFlight build (hikaye listesine bakabilmek için).
- S3 bucket CORS yapılandırılmış.
- Test user OneSignal kayıtlı.

## Senaryo 1: Yeni Hikaye Oluşturma

1. `/panel/login` → admin login.
2. `/panel/stories` → "Yeni Hikaye" butonu.
3. **Temel Bilgiler** tab:
   - Locale EN: Title = "Test Story", Summary = "Test summary"
   - Locale TR: Title = "Test Hikaye", Summary = "Test özet"
   - Genre: "adventure", Difficulty: "easy", Age Rating: "12+"
   - isPaid: false, creditCost: 0
4. **Görseller** tab:
   - Cover image yükle (1 dosya) — WebP dönüşümü + thumbnail üretimi kontrol.
   - Gallery: 3 dosya çoklu upload.
5. **İçerik** tab: 2 chapter ekle, her birine 1 scene.
6. **Karakterler** tab: 1 karakter + avatar.
7. **Ayarlar** tab: Tags = ["test", "demo"], SEO başlık.
8. "Kaydet" → toast "Oluşturuldu" + edit sayfasına redirect.

**Beklenti:**
- MongoDB'de yeni doc, translations.en ve translations.tr dolu.
- S3'te 4 image (cover + 3 gallery + 1 character avatar) yüklü.
- readCount: 0, isPublished: false (default).

## Senaryo 2: Hikaye Düzenleme

1. Önceki senaryo'da oluşturulan hikayeyi aç.
2. **Görseller** tab: Gallery grid'de 3 image görünür. Sürükle-bırak ile sıralama değiştir.
3. Alt text ekle.
4. "Kaydet".

**Beklenti:** `galleryImages` array'i yeni sırada, `alt` alanları dolu.

## Senaryo 3: Yayınla + iOS Görünürlük

1. Hikayeyi edit et, `isPublished: true` yap, kaydet.
2. iOS app'i aç veya `/stories/sync?since=<old-date>` çağır.
3. iOS'ta hikaye listesinde görünmeli (60 sn içinde).

**Beklenti:** `GET /api/stories` response'unda yeni hikaye var, locale-aware title iOS locale'ine göre seçiliyor.

## Senaryo 4: Filtreleme + URL State Sync

1. `/panel/stories?q=test&genre=adventure&pub=true`
2. Sayfayı yenile — filtreler URL'den yeniden set oluyor.
3. Clear butonu → filtreler sıfır, URL temiz.

**Beklenti:** URL state sync çalışıyor, search debounce 300ms.

## Senaryo 5: Kopyalama

1. List sayfası → "Kopyala" butonu.
2. Toast "Kopyalandı" + yeni edit sayfasına redirect.

**Beklenti:** Yeni doc, title suffix " (copy)", isPublished: false, readCount: 0.

## Senaryo 6: Silme (Soft)

1. List sayfası → "Sil".
2. Modal: active session count gösterilir, "SIL" yaz, onayla.

**Beklenti:** `deletedAt` set, list default filter'dan gizli (`isPublished=false&deleted` filter'ında görünür).

## Senaryo 7: Image Presign + Upload Hatası

1. Edit sayfası, cover uploader'a desteklenmeyen format (PDF) yüklemeye çalış.
2. Backend 400 "İzin verilen türler: jpeg, png, webp".

**Beklenti:** panelToast.error tetiklenir, upload durur.

## Senaryo 8: iOS Cache Invalidation

1. Panel'den hikayeyi düzenle (title değiştir).
2. iOS app foreground'a dön → `loadStoriesIncremental()` tetiklenir.
3. Liste yeni title ile güncellenir.

**Beklenti:** `UserDefaults[stories.lastSyncAt]` güncellendi.

## Kontrol Listesi

- [ ] Senaryo 1: Yeni hikaye oluşturma (tüm tablar)
- [ ] Senaryo 2: Düzenleme + drag-drop reorder
- [ ] Senaryo 3: Publish + iOS görünürlük
- [ ] Senaryo 4: URL state sync
- [ ] Senaryo 5: Kopyalama
- [ ] Senaryo 6: Soft delete + active session uyarısı
- [ ] Senaryo 7: Upload validation
- [ ] Senaryo 8: iOS cache invalidation

## Bilinen Sınırlamalar

- **Client-side WebP dönüşüm:** Safari <14 destek yok — Chrome/Firefox/Safari 14+ test et.
- **Drag-drop sıralama persist:** Gallery reorder şu an sadece client-side state'e yazıyor; "Kaydet" sonrası backend'e gidiyor. Intermediate unsaved state tarayıcı reload'ında kaybolur.
- **Multi-locale fallback zinciri:** Current locale → EN → flat title. 12 locale'in hepsi doldurulmazsa EN fallback.
