(function (global) {
  'use strict';
  const CONTAINER_ID = 'panel-toast-container';
  function ensureContainer() {
    let c = document.getElementById(CONTAINER_ID);
    if (!c) {
      c = document.createElement('div');
      c.id = CONTAINER_ID;
      c.className = 'fixed top-5 end-5 z-50 flex flex-col gap-2 pointer-events-none';
      document.body.appendChild(c);
    }
    return c;
  }
  function show(variant, message, ttl = 5000) {
    const container = ensureContainer();
    const el = document.createElement('div');
    const base = 'pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-md shadow-sm text-sm min-w-[240px] max-w-[380px] transition-all';
    const variants = {
      success: 'bg-success/10 text-success border border-success/20',
      error:   'bg-destructive/10 text-destructive border border-destructive/20',
      info:    'bg-primary/10 text-primary border border-primary/20',
    };
    el.className = base + ' ' + (variants[variant] || variants.info);
    const icons = { success: 'ki-check-circle', error: 'ki-shield-cross', info: 'ki-information-2' };
    el.innerHTML = '<i class="ki-filled ' + (icons[variant] || icons.info) + '"></i><span class="flex-1">' + escapeHtml(message) + '</span>';
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, ttl);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  global.panelToast = {
    success: (m, t) => show('success', m, t),
    error:   (m, t) => show('error', m, t),
    info:    (m, t) => show('info', m, t),
  };
})(window);
