(function() {
  let state = { search: '', genre: '', isPaid: '', isPublished: '', page: 1, limit: 25 };
  let total = 0;

  function fmt(d) { return d ? new Date(d).toLocaleDateString('tr-TR') : '—'; }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function thumb(s) {
    const url = s.coverImage?.[0]?.thumbnail || s.coverImage?.[0]?.url;
    return url ? `<img src="${esc(url)}" class="w-12 h-16 object-cover rounded"/>` : '<div class="w-12 h-16 bg-muted rounded flex items-center justify-center"><i class="ki-filled ki-book text-muted-foreground"></i></div>';
  }

  async function load() {
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
      tbody.innerHTML = stories.map(s => {
        const title = s.translations?.en?.title || s.title || '—';
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
  document.getElementById('clear-filters').addEventListener('click', () => {
    ['search-input','genre-filter','paid-filter','published-filter'].forEach(id => document.getElementById(id).value = '');
    state = { search: '', genre: '', isPaid: '', isPublished: '', page: 1, limit: 25 };
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
      if (!confirm('Silmek istediğine emin misin?')) return;
      const id = del.dataset.id;
      try {
        await window.panelApi.delete(`/panel/api/stories/${id}`);
        window.panelToast?.success('Silindi');
        load();
      } catch {}
    }
  });

  load();
})();
