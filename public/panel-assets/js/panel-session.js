(function () {
  if (!document.body?.classList.contains('demo1')) return; // only panel pages (layout sets demo1)

  const IDLE_KEY = 'panel:last-activity';
  const WARN_BEFORE_MS = 5 * 60 * 1000; // 5 dk kala uyar
  // Default idle: 30 gün (sunucudan gelen idleTimeoutMs override eder)
  let idleTimeoutMs = 30 * 24 * 60 * 60 * 1000;
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
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:16px;';
    backdrop.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:420px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,0.35);overflow:hidden;"><div style="padding:24px;"><h3 style="font-size:18px;font-weight:600;margin-bottom:8px;">Oturumunun bitmesine az kaldı</h3><p style="font-size:14px;color:#6b7280;margin-bottom:20px;">5 dakika içinde çıkış yapılacak. Devam etmek için oturumu uzat.</p><div style="display:flex;justify-content:flex-end;gap:8px;"><button class="kt-btn kt-btn-outline" id="ses-cancel">Vazgeç</button><button class="kt-btn kt-btn-primary" id="ses-extend">Oturumu Uzat</button></div></div></div>';
    document.body.appendChild(backdrop);
    document.getElementById('ses-cancel').onclick = () => backdrop.remove();
    document.getElementById('ses-extend').onclick = async () => {
      const btn = document.getElementById('ses-extend');
      btn.disabled = true;
      try {
        const data = await window.panelApi.post('/panel/api/session/extend');
        if (data?.expiresAt) expiresAt = new Date(data.expiresAt);
        backdrop.remove();
        scheduleWarning();
        window.panelToast?.success('Oturum uzatıldı');
      } catch (err) {
        console.error('[panel-session] extend failed', err);
        window.panelToast?.error('Oturum uzatılamadı: ' + (err?.body?.message || err?.message || 'bilinmiyor'));
        btn.disabled = false;
      }
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
