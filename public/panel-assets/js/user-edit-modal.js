(function() {
  let currentUserId = null;

  async function open(userId) {
    currentUserId = userId;
    document.getElementById('user-edit-modal').classList.remove('hidden');
    try {
      const detail = await window.panelApi.get(`/panel/api/users/${userId}`);
      const u = detail.user || detail;
      document.getElementById('f-handle').value = u.userHandle || '';
      document.getElementById('f-display').value = u.displayName || '';
      document.getElementById('f-email').value = u.email || '';
      document.getElementById('f-premium').checked = !!u.premium?.isPremium;
      document.getElementById('f-plan').value = u.premium?.plan || '';
      document.getElementById('f-credits').value = u.credits ?? 0;
      const status = u.isDeleted ? 'Silinmiş' : u.isBanned ? 'Banlı' : 'Aktif';
      document.getElementById('f-status').textContent = status;
      document.getElementById('f-friend-count').textContent = detail.friendCount ?? 0;
      document.getElementById('f-story-count').textContent = detail.storyCount ?? 0;
      const sessions = detail.recentSessions || [];
      document.getElementById('f-recent-sessions').innerHTML = sessions.length
        ? sessions.map(s => `<div class="py-2 border-b border-border"><div class="font-medium">${s.storyId || '—'}</div><div class="text-xs text-muted-foreground">${new Date(s.createdAt).toLocaleString('tr-TR')}</div></div>`).join('')
        : '<p class="text-muted-foreground">Session yok</p>';
    } catch {
      window.panelToast?.error('Yüklenemedi');
    }
  }

  window.openUserEditModal = open;
  window.closeUserEditModal = () => document.getElementById('user-edit-modal').classList.add('hidden');

  // Tab switch
  document.addEventListener('click', e => {
    const tab = e.target.closest('.user-tab');
    if (!tab) return;
    const name = tab.dataset.tab;
    document.querySelectorAll('.user-tab').forEach(b => {
      b.classList.toggle('border-b-2', b.dataset.tab === name);
      b.classList.toggle('border-primary', b.dataset.tab === name);
      b.classList.toggle('text-primary', b.dataset.tab === name);
      b.classList.toggle('text-muted-foreground', b.dataset.tab !== name);
    });
    document.querySelectorAll('.user-panel').forEach(p => {
      p.classList.toggle('hidden', p.dataset.tab !== name);
    });
  });

  // Save
  document.getElementById('btn-save').addEventListener('click', async () => {
    const payload = {
      userHandle: document.getElementById('f-handle').value || undefined,
      displayName: document.getElementById('f-display').value || undefined,
      email: document.getElementById('f-email').value || undefined,
      credits: parseFloat(document.getElementById('f-credits').value) || undefined,
      premium: {
        isPremium: document.getElementById('f-premium').checked,
        plan: document.getElementById('f-plan').value || undefined,
      },
    };
    try {
      await window.panelApi.patch(`/panel/api/users/${currentUserId}`, payload);
      window.panelToast?.success('Kaydedildi');
      window.closeUserEditModal();
      if (typeof window.reloadUsersTable === 'function') window.reloadUsersTable();
    } catch {}
  });

  // Ban / Unban
  document.getElementById('btn-ban').addEventListener('click', async () => {
    const reason = document.getElementById('f-ban-reason').value;
    const untilInput = document.getElementById('f-ban-until').value;
    const until = untilInput ? new Date(untilInput).toISOString() : undefined;
    try {
      await window.panelApi.post(`/panel/api/users/${currentUserId}/ban`, { reason, until });
      window.panelToast?.success('Banlandı');
      open(currentUserId);
    } catch {}
  });
  document.getElementById('btn-unban').addEventListener('click', async () => {
    try {
      await window.panelApi.post(`/panel/api/users/${currentUserId}/unban`, {});
      window.panelToast?.success('Ban kaldırıldı');
      open(currentUserId);
    } catch {}
  });

  // Delete 2-step
  const delInput = document.getElementById('f-delete-confirm');
  delInput.addEventListener('input', () => {
    document.getElementById('btn-delete').disabled = delInput.value !== 'SIL';
  });
  document.getElementById('btn-delete').addEventListener('click', async () => {
    if (!confirm('Bu kullanıcı anonim hale getirilecek. Emin misin?')) return;
    try {
      await window.panelApi.delete(`/panel/api/users/${currentUserId}`);
      window.panelToast?.success('Silindi');
      window.closeUserEditModal();
      if (typeof window.reloadUsersTable === 'function') window.reloadUsersTable();
    } catch {}
  });
})();
