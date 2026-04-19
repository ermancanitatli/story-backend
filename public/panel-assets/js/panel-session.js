/**
 * Panel session helper.
 *
 * Oturum süresi 30 gün, rolling cookie (her request cookie süresini yeniler).
 * Bu yüzden ne idle auto-logout ne de "oturum bitiyor" uyarı modal'ı gerekli.
 * Kullanıcı 30 gün aktif kullanmazsa cookie doğal olarak expire olur ve bir
 * sonraki request 401 ile login'e yönlendirir.
 *
 * Not: Eski pop-up modal + idle watcher mantığı kaldırıldı (kullanıcı rahatsız
 * oluyordu ve 24h → 30 gün rolling cookie sonrası işlevsiz kaldı).
 */
(function () {
  // Panel sayfası dışında çalışma
  if (!document.body?.classList.contains('demo1')) return;
  // Intentionally empty — no warning modal, no idle logout.
})();
