(function () {
  'use strict';

  let state = {
    search: '',
    isPremium: '',
    isBanned: '',
    isDeleted: '',
    page: 0,
    limit: 25,
    sortBy: 'createdAt',
    sortDir: 'desc',
  };
  let totalCount = 0;

  function fmt(d) {
    return d ? new Date(d).toLocaleString('tr-TR') : '—';
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]);
  }

  async function load() {
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.isPremium !== '') params.set('isPremium', state.isPremium);
    if (state.isBanned !== '') params.set('isBanned', state.isBanned);
    if (state.isDeleted !== '') params.set('isDeleted', state.isDeleted);
    params.set('limit', state.limit);
    params.set('offset', state.page * state.limit);
    params.set('sortBy', state.sortBy);
    params.set('sortDir', state.sortDir);

    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML =
      '<tr><td colspan="8" class="p-8 text-center">Yükleniyor...</td></tr>';

    try {
      const res = await window.panelApi.get(
        '/panel/api/users?' + params.toString(),
      );
      const users = res.users || [];
      totalCount = res.total || 0;
      if (users.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="8" class="p-8 text-center text-muted-foreground">Kullanıcı bulunamadı</td></tr>';
        document.getElementById('users-total').textContent = '0 kullanıcı';
        return;
      }
      tbody.innerHTML = users
        .map((u) => {
          const status = u.isDeleted
            ? '<span class="kt-badge kt-badge-destructive">Silinmiş</span>'
            : u.isBanned
              ? '<span class="kt-badge kt-badge-warning">Banlı</span>'
              : '<span class="kt-badge kt-badge-success">Aktif</span>';
          const plan = u.premium?.isPremium
            ? '<span class="kt-badge kt-badge-primary">Premium</span>'
            : '<span class="kt-badge kt-badge-outline">Ücretsiz</span>';
          const initial = (u.displayName || u.userHandle || 'A')
            .charAt(0)
            .toUpperCase();
          return `<tr data-user-id="${esc(u._id)}">
          <td><div class="flex items-center gap-3"><div class="flex items-center justify-center size-9 rounded-full bg-primary/10 text-primary font-semibold">${esc(initial)}</div><span class="text-sm">${esc(u.userHandle || '—')}</span></div></td>
          <td>${esc(u.displayName || '—')}</td>
          <td>${esc(u.email || '—')}</td>
          <td>${plan}</td>
          <td>${fmt(u.createdAt)}</td>
          <td>${fmt(u.lastSeen || u.lastLoginAt)}</td>
          <td>${status}</td>
          <td class="text-end">
            <div class="flex items-center justify-end gap-2">
              <button class="kt-btn kt-btn-sm kt-btn-outline edit-btn" data-id="${esc(u._id)}">Düzenle</button>
              ${
                u.isBanned
                  ? `<button class="kt-btn kt-btn-sm kt-btn-outline action-unban" data-id="${esc(u._id)}">Unban</button>`
                  : `<button class="kt-btn kt-btn-sm kt-btn-outline action-ban" data-id="${esc(u._id)}">Ban</button>`
              }
            </div>
          </td>
        </tr>`;
        })
        .join('');
      document.getElementById('users-total').textContent =
        `${totalCount} kullanıcı`;
    } catch (e) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="p-8 text-center text-destructive">Hata oluştu</td></tr>';
    }
  }

  let searchTimer;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value;
      state.page = 0;
      load();
    }, 300);
  });

  document.getElementById('premium-filter').addEventListener('change', (e) => {
    state.isPremium = e.target.value;
    state.page = 0;
    load();
  });

  document.getElementById('status-filter').addEventListener('change', (e) => {
    const v = e.target.value;
    state.isBanned = v === 'banned' ? true : '';
    state.isDeleted = v === 'deleted' ? true : '';
    state.page = 0;
    load();
  });

  document.getElementById('clear-filters').addEventListener('click', () => {
    document.getElementById('search-input').value = '';
    document.getElementById('premium-filter').value = '';
    document.getElementById('status-filter').value = '';
    state = {
      search: '',
      isPremium: '',
      isBanned: '',
      isDeleted: '',
      page: 0,
      limit: 25,
    };
    load();
  });

  document.getElementById('users-prev').addEventListener('click', () => {
    if (state.page > 0) {
      state.page--;
      load();
    }
  });

  document.getElementById('users-next').addEventListener('click', () => {
    if ((state.page + 1) * state.limit < totalCount) {
      state.page++;
      load();
    }
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.edit-btn');
    if (btn) {
      window.panelToast?.info("Edit modal USER-16 task'ıyla gelecek");
      return;
    }
    const banBtn = e.target.closest('.action-ban');
    if (banBtn) {
      if (!confirm('Kullanıcıyı banla?')) return;
      try {
        await window.panelApi.post(
          `/panel/api/users/${banBtn.dataset.id}/ban`,
          { reason: 'admin action' },
        );
        window.panelToast?.success('Banlandı');
        load();
      } catch {
        window.panelToast?.error('Ban işlemi başarısız');
      }
      return;
    }
    const unbanBtn = e.target.closest('.action-unban');
    if (unbanBtn) {
      if (!confirm('Kullanıcının banını kaldır?')) return;
      try {
        await window.panelApi.post(
          `/panel/api/users/${unbanBtn.dataset.id}/unban`,
          {},
        );
        window.panelToast?.success('Ban kaldırıldı');
        load();
      } catch {
        window.panelToast?.error('Unban işlemi başarısız');
      }
      return;
    }
  });

  // Sortable kolon başlıkları
  document.querySelectorAll('th[data-sortable]').forEach((th) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.sortable;
      if (state.sortBy === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortBy = col;
        state.sortDir = 'desc';
      }
      updateSortIndicators();
      load();
    });
  });

  function updateSortIndicators() {
    document.querySelectorAll('th[data-sortable]').forEach((th) => {
      const col = th.dataset.sortable;
      const base = th.dataset.label || th.textContent.replace(/[\s↑↓]+$/, '');
      th.dataset.label = base;
      if (state.sortBy === col) {
        th.textContent = base + (state.sortDir === 'asc' ? ' ↑' : ' ↓');
      } else {
        th.textContent = base;
      }
    });
  }

  updateSortIndicators();
  load();
})();
