(function () {
  if (!document.body?.classList.contains('demo1')) return; // only panel pages (layout sets demo1)

  const IDLE_KEY = 'panel:last-activity';
  const WARN_BEFORE_MS = 5 * 60 * 1000; // 5 dk kala uyar
  let idleTimeoutMs = 10 * 60 * 1000;
  let expiresAt = null;
  let warnTimer = null;
  let idleCheckTimer = null;

  async function loadMeta() {
    try {
      const meta = await window.panelApi.get('/panel/api/session/meta');
      expiresAt = new Date(meta.expiresAt);
      idleTimeoutMs = meta.idleTimeoutMs || idleTimeoutMs;
      scheduleWarning();
    } catch (e) { /* logged by panelApi */ }
  }

  function scheduleWarning() {
    if (warnTimer) clearTimeout(warnTimer);
    if (!expiresAt) return;
    const ms = expiresAt.getTime() - Date.now() - WARN_BEFORE_MS;
    if (ms > 0) warnTimer = setTimeout(showWarning, ms);
  }

  function showWarning() {
    const modalId = 'panel-session-warning';
    if (document.getElementById(modalId)) return;
    const backdrop = document.createElement('div');
    backdrop.id = modalId;
    backdrop.className = 'fixed inset-0 z-50 bg-black/40 flex items-center justify-center';
    backdrop.innerHTML = '<div class="kt-card max-w-md w-full"><div class="kt-card-content p-6"><h3 class="text-lg font-semibold mb-2">Oturumunun bitmesine az kaldı</h3><p class="text-sm text-secondary-foreground mb-5">5 dakika içinde çıkış yapılacak. Devam etmek için oturumu uzat.</p><div class="flex justify-end gap-2"><button class="kt-btn kt-btn-outline" id="ses-cancel">Vazgeç</button><button class="kt-btn kt-btn-primary" id="ses-extend">Oturumu Uzat</button></div></div></div>';
    document.body.appendChild(backdrop);
    document.getElementById('ses-cancel').onclick = () => backdrop.remove();
    document.getElementById('ses-extend').onclick = async () => {
      try {
        const data = await window.panelApi.post('/panel/api/session/extend');
        expiresAt = new Date(data.expiresAt);
        backdrop.remove();
        scheduleWarning();
        window.panelToast?.success('Oturum uzatıldı');
      } catch (e) {}
    };
  }

  function recordActivity() {
    localStorage.setItem(IDLE_KEY, String(Date.now()));
  }

  function checkIdle() {
    const last = parseInt(localStorage.getItem(IDLE_KEY) || String(Date.now()), 10);
    if (Date.now() - last > idleTimeoutMs) {
      const f = document.createElement('form');
      f.method = 'POST';
      f.action = '/panel/logout';
      document.body.appendChild(f);
      f.submit();
    }
  }

  ['mousemove','keydown','click','scroll','touchstart'].forEach(ev => document.addEventListener(ev, recordActivity, { passive: true }));
  recordActivity();
  idleCheckTimer = setInterval(checkIdle, 30 * 1000);

  if (window.panelApi) loadMeta();
  else window.addEventListener('load', () => setTimeout(loadMeta, 100));
})();
