(function () {
  'use strict';

  const state = {
    action: '',
    targetUserId: '',
    adminId: '',
    offset: 0,
    limit: 50,
  };
  let all = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function fmt(d) {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleString('tr-TR', { hour12: false });
    } catch (e) {
      return String(d);
    }
  }

  function actionBadgeClass(action) {
    switch (action) {
      case 'BAN':
      case 'DELETE':
      case 'ROLE_CHANGE':
        return 'kt-badge kt-badge-destructive';
      case 'UNBAN':
      case 'UPDATE_PREMIUM':
        return 'kt-badge kt-badge-success';
      case 'LOGIN':
      case 'LOGOUT':
        return 'kt-badge kt-badge-secondary';
      case 'PASSWORD_CHANGE':
        return 'kt-badge kt-badge-warning';
      default:
        return 'kt-badge kt-badge-primary';
    }
  }

  async function load(append) {
    const params = new URLSearchParams();
    if (state.action) params.set('action', state.action);
    if (state.targetUserId) params.set('targetUserId', state.targetUserId);
    if (state.adminId) params.set('adminId', state.adminId);
    params.set('limit', String(state.limit));
    params.set('offset', String(state.offset));
    try {
      const res = await window.panelApi.get(
        '/panel/api/audit-logs?' + params.toString(),
      );
      const logs = Array.isArray(res.logs) ? res.logs : [];
      if (append) all = all.concat(logs);
      else all = logs;
      render(res.total || all.length);
    } catch (e) {
      // panel-api already shows toast
    }
  }

  function render(total) {
    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;
    if (!all.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="px-4 py-8 text-center text-secondary-foreground">Kayıt bulunamadı.</td></tr>';
    } else {
      tbody.innerHTML = all
        .map((log) => {
          const meta = log.metadata || {};
          const resource = log.resource || meta.resource || '-';
          const ip = log.ip || meta.ip || '-';
          const target = log.targetUserId || log.resourceId || meta.resourceId || '-';
          const handle = log.targetUserHandle ? ' (@' + esc(log.targetUserHandle) + ')' : '';
          const metaStr = meta && Object.keys(meta).length > 0
            ? '<details class="mt-1"><summary class="cursor-pointer text-primary">meta</summary><pre class="text-[10px] whitespace-pre-wrap mt-1">' +
              esc(JSON.stringify(meta, null, 2)) +
              '</pre></details>'
            : '';
          const reasonStr = log.reason
            ? '<div class="truncate">' + esc(log.reason) + '</div>'
            : '';
          return (
            '<tr class="border-t border-border">' +
            '<td class="px-4 py-2 whitespace-nowrap text-xs text-secondary-foreground">' +
            esc(fmt(log.createdAt)) +
            '</td>' +
            '<td class="px-4 py-2"><div class="flex flex-col">' +
            '<span class="font-medium text-mono">' + esc(log.adminUsername || '-') + '</span>' +
            '<span class="text-xs text-secondary-foreground">' + esc(log.adminId || '') + '</span>' +
            '</div></td>' +
            '<td class="px-4 py-2"><span class="' +
            actionBadgeClass(log.action) +
            '">' + esc(log.action) + '</span></td>' +
            '<td class="px-4 py-2 text-xs">' + esc(resource) + '</td>' +
            '<td class="px-4 py-2 text-xs">' + esc(target) + handle + '</td>' +
            '<td class="px-4 py-2 text-xs text-secondary-foreground">' + esc(ip) + '</td>' +
            '<td class="px-4 py-2 text-xs max-w-[320px]">' + reasonStr + metaStr + '</td>' +
            '</tr>'
          );
        })
        .join('');
    }

    const totalEl = document.getElementById('audit-total');
    if (totalEl) totalEl.textContent = all.length + ' / ' + total;

    const btn = document.getElementById('load-more');
    if (btn) btn.classList.toggle('hidden', all.length >= total);
  }

  function resetAndLoad() {
    state.offset = 0;
    all = [];
    load(false);
  }

  function wire() {
    const actionSel = document.getElementById('action-filter');
    if (actionSel) {
      actionSel.addEventListener('change', (e) => {
        state.action = e.target.value;
        resetAndLoad();
      });
    }

    const targetInput = document.getElementById('target-filter');
    if (targetInput) {
      targetInput.addEventListener('change', (e) => {
        state.targetUserId = e.target.value.trim();
        resetAndLoad();
      });
    }

    const adminInput = document.getElementById('admin-filter');
    if (adminInput) {
      adminInput.addEventListener('change', (e) => {
        state.adminId = e.target.value.trim();
        resetAndLoad();
      });
    }

    const clearBtn = document.getElementById('clear-filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        state.action = '';
        state.targetUserId = '';
        state.adminId = '';
        if (actionSel) actionSel.value = '';
        if (targetInput) targetInput.value = '';
        if (adminInput) adminInput.value = '';
        resetAndLoad();
      });
    }

    const loadMoreBtn = document.getElementById('load-more');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        state.offset += state.limit;
        load(true);
      });
    }

    load(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
