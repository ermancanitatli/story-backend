(function() {
  function fmt(d) { return d ? new Date(d).toLocaleString('tr-TR') : '—'; }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function badge(status) {
    const colors = { sent: 'kt-badge-success', pending: 'kt-badge-warning', failed: 'kt-badge-destructive', partial: 'kt-badge-warning', cancelled: 'kt-badge-secondary' };
    return `<span class="kt-badge ${colors[status] || 'kt-badge-outline'}">${esc(status)}</span>`;
  }

  async function load() {
    const tbody = document.getElementById('history-tbody');
    try {
      const logs = await window.panelApi.get('/panel/api/notifications/history?limit=50');
      if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-muted-foreground">Henüz bildirim gönderilmedi</td></tr>';
        return;
      }
      tbody.innerHTML = logs.map(l => {
        const title = l.headings?.tr || l.headings?.en || '—';
        return `<tr data-id="${l._id}" class="cursor-pointer hover:bg-muted/30">
          <td>${fmt(l.createdAt)}</td>
          <td>${esc(l.senderUsername)}</td>
          <td><span class="kt-badge kt-badge-outline">${esc(l.segment)}</span></td>
          <td class="max-w-xs truncate">${esc(title)}</td>
          <td>${badge(l.status)}</td>
          <td>${l.successCount ?? l.estimatedRecipients ?? 0}</td>
          <td class="text-end"><button class="kt-btn kt-btn-sm kt-btn-outline detail-btn">Detay</button></td>
        </tr>`;
      }).join('');

      document.querySelectorAll('.detail-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const tr = btn.closest('tr');
          const id = tr.dataset.id;
          const log = logs.find(l => l._id === id);
          document.getElementById('detail-json').textContent = JSON.stringify(log, null, 2);
          document.getElementById('detail-drawer').classList.remove('hidden');
        });
      });
    } catch {
      tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-destructive">Hata</td></tr>';
    }
  }

  load();
})();
