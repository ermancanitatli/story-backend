(function() {
  // URL state sync
  function stateToUrl(s) {
    const params = new URLSearchParams();
    if (s.search) params.set('q', s.search);
    if (s.genre) params.set('genre', s.genre);
    if (s.isPaid !== '') params.set('paid', s.isPaid);
    if (s.isPublished !== '') params.set('pub', s.isPublished);
    if (s.locale) params.set('locale', s.locale);
    if (s.page > 1) params.set('page', s.page);
    const qs = params.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function urlToState() {
    const p = new URLSearchParams(location.search);
    return {
      search: p.get('q') || '',
      genre: p.get('genre') || '',
      isPaid: p.get('paid') || '',
      isPublished: p.get('pub') || '',
      locale: p.get('locale') || '',
      page: parseInt(p.get('page') || '1', 10),
      limit: 25,
    };
  }

  let state = urlToState();
  let total = 0;

  // Filter input'ları URL'den set et
  document.getElementById('search-input').value = state.search;
  document.getElementById('genre-filter').value = state.genre;
  document.getElementById('paid-filter').value = state.isPaid;
  document.getElementById('published-filter').value = state.isPublished;
  const localeEl = document.getElementById('locale-filter');
  if (localeEl) localeEl.value = state.locale;

  function fmt(d) { return d ? new Date(d).toLocaleDateString('tr-TR') : '—'; }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function thumb(s) {
    const url = s.coverImage?.[0]?.thumbnail || s.coverImage?.[0]?.url;
    return url ? `<img src="${esc(url)}" class="w-12 h-16 object-cover rounded"/>` : '<div class="w-12 h-16 bg-muted rounded flex items-center justify-center"><i class="ki-filled ki-book text-muted-foreground"></i></div>';
  }

  async function load() {
    stateToUrl(state);
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.genre) params.set('genre', state.genre);
    if (state.isPaid !== '') params.set('isPaid', state.isPaid);
    if (state.isPublished !== '') params.set('isPublished', state.isPublished);
    params.set('page', state.page);
    params.set('limit', state.limit);

    const tbody = document.getElementById('stories-tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center">Yükleniyor...</td></tr>';
    try {
      const res = await window.panelApi.get('/panel/api/stories?' + params.toString());
      const stories = res.stories || [];
      total = res.total || 0;
      if (stories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-muted-foreground">Hikaye bulunamadı</td></tr>';
        return;
      }
      const loc = state.locale || 'en';
      tbody.innerHTML = stories.map(s => {
        const title = s.translations?.[loc]?.title || s.translations?.en?.title || s.title || '—';
        const paid = s.isPaid ? '<span class="kt-badge kt-badge-warning">Ücretli</span>' : '<span class="kt-badge kt-badge-outline">Ücretsiz</span>';
        const pub = s.isPublished ? '<span class="kt-badge kt-badge-success">Yayın</span>' : '<span class="kt-badge kt-badge-secondary">Taslak</span>';
        return `<tr data-id="${s._id}">
          <td>${thumb(s)}</td>
          <td>${esc(title)}</td>
          <td>${esc(s.genre || '—')}</td>
          <td>${paid}</td>
          <td>${pub}</td>
          <td>${s.readCount ?? 0}</td>
          <td>${fmt(s.updatedAt)}</td>
          <td class="text-end">
            <a href="/panel/stories/${s._id}/edit" class="kt-btn kt-btn-sm kt-btn-outline">Düzenle</a>
            <button class="kt-btn kt-btn-sm kt-btn-outline dup-btn" data-id="${s._id}">Kopyala</button>
            <button class="kt-btn kt-btn-sm kt-btn-destructive del-btn" data-id="${s._id}">Sil</button>
          </td>
        </tr>`;
      }).join('');
      document.getElementById('stories-total').textContent = `${total} hikaye`;
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-destructive">Hata</td></tr>';
    }
  }

  let timer;
  document.getElementById('search-input').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.search = e.target.value; state.page = 1; load(); }, 300);
  });
  ['genre-filter','paid-filter','published-filter'].forEach((id, i) => {
    document.getElementById(id).addEventListener('change', e => {
      if (id === 'genre-filter') state.genre = e.target.value;
      if (id === 'paid-filter') state.isPaid = e.target.value;
      if (id === 'published-filter') state.isPublished = e.target.value;
      state.page = 1;
      load();
    });
  });
  if (localeEl) {
    localeEl.addEventListener('change', e => {
      state.locale = e.target.value;
      load();
    });
  }
  document.getElementById('clear-filters').addEventListener('click', () => {
    ['search-input','genre-filter','paid-filter','published-filter'].forEach(id => document.getElementById(id).value = '');
    if (localeEl) localeEl.value = '';
    state = { search: '', genre: '', isPaid: '', isPublished: '', locale: '', page: 1, limit: 25 };
    history.replaceState(null, '', location.pathname);
    load();
  });
  document.getElementById('stories-prev').addEventListener('click', () => { if (state.page > 1) { state.page--; load(); } });
  document.getElementById('stories-next').addEventListener('click', () => { if (state.page * state.limit < total) { state.page++; load(); } });

  document.addEventListener('click', async e => {
    const dup = e.target.closest('.dup-btn');
    const del = e.target.closest('.del-btn');
    if (dup) {
      const id = dup.dataset.id;
      try {
        const copy = await window.panelApi.post(`/panel/api/stories/${id}/duplicate`);
        window.location.href = `/panel/stories/${copy._id}/edit`;
      } catch {}
    }
    if (del) {
      const id = del.dataset.id;
      let sessionCount = 0;
      try {
        const res = await window.panelApi.get(`/panel/api/stories/${id}/active-sessions`);
        sessionCount = res.count || 0;
      } catch {}
      openDeleteModal(id, sessionCount);
    }
  });

  function openDeleteModal(id, sessionCount) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 bg-black/40 flex items-center justify-center';
    modal.innerHTML = `
      <div class="kt-card max-w-md w-full">
        <div class="kt-card-content p-6">
          <h3 class="text-lg font-semibold mb-2">Hikayeyi Sil?</h3>
          <p class="text-sm text-secondary-foreground mb-4">Bu hikayenin <strong>${sessionCount}</strong> aktif oturumu var.
            ${sessionCount > 0 ? '<br><span class="text-warning">Silinirse mevcut oturumlar devam edebilir ancak yeni kullanıcılar başlatamaz.</span>' : ''}
          </p>
          <p class="text-sm mb-4">Silmek için <strong>SIL</strong> yazın:</p>
          <input id="del-confirm" type="text" class="kt-input mb-4" autocomplete="off"/>
          <div class="flex justify-end gap-2">
            <button id="del-cancel" class="kt-btn kt-btn-outline">Vazgeç</button>
            <button id="del-ok" class="kt-btn kt-btn-destructive" disabled>Sil</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const input = modal.querySelector('#del-confirm');
    const okBtn = modal.querySelector('#del-ok');
    input.addEventListener('input', () => {
      okBtn.disabled = input.value !== 'SIL';
    });
    modal.querySelector('#del-cancel').addEventListener('click', () => modal.remove());
    okBtn.addEventListener('click', async () => {
      okBtn.disabled = true;
      try {
        await window.panelApi.delete(`/panel/api/stories/${id}`);
        window.panelToast?.success('Silindi');
        modal.remove();
        if (typeof load === 'function') load();
        else document.querySelector(`tr[data-id="${id}"]`)?.remove();
      } catch {
        okBtn.disabled = false;
      }
    });
    input.focus();
  }

  load();
})();
