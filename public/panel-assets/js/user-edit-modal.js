(function() {
  let currentUserId = null;

  // Modal'ı body'e taşı — Metronic transform'lu parent position:fixed'i bozar
  function ensureModalPromoted() {
    const modalEl = document.getElementById('user-edit-modal');
    if (!modalEl) return null;
    if (modalEl.parentElement !== document.body) {
      document.body.appendChild(modalEl);
    }
    modalEl.style.position = 'fixed';
    modalEl.style.inset = '0';
    modalEl.style.zIndex = '9999';
    // Başlangıçta gizli — açıldığında display:flex'e çevrilir
    if (modalEl.classList.contains('hidden')) modalEl.style.display = 'none';
    return modalEl;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureModalPromoted);
  } else {
    ensureModalPromoted();
  }

  async function open(userId) {
    currentUserId = userId;
    const el = ensureModalPromoted() || document.getElementById('user-edit-modal');
    if (!el) {
      console.error('[user-edit-modal] #user-edit-modal element bulunamadı');
      window.panelToast?.error('Modal yüklenemedi');
      return;
    }
    el.classList.remove('hidden');
    el.style.display = 'flex'; // inline display:flex — hidden class'ı ezse bile görünsün
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
  window.closeUserEditModal = () => {
    const el = document.getElementById('user-edit-modal');
    if (!el) return;
    el.classList.add('hidden');
    el.style.display = 'none';
  };

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
    } catch (err) { console.error('[user-edit-modal]', err); window.panelToast?.error('İşlem başarısız: ' + (err?.body?.message || err?.message || 'bilinmiyor')); }
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
    } catch (err) { console.error('[user-edit-modal]', err); window.panelToast?.error('İşlem başarısız: ' + (err?.body?.message || err?.message || 'bilinmiyor')); }
  });
  document.getElementById('btn-unban').addEventListener('click', async () => {
    try {
      await window.panelApi.post(`/panel/api/users/${currentUserId}/unban`, {});
      window.panelToast?.success('Ban kaldırıldı');
      open(currentUserId);
    } catch (err) { console.error('[user-edit-modal]', err); window.panelToast?.error('İşlem başarısız: ' + (err?.body?.message || err?.message || 'bilinmiyor')); }
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
    } catch (err) { console.error('[user-edit-modal]', err); window.panelToast?.error('İşlem başarısız: ' + (err?.body?.message || err?.message || 'bilinmiyor')); }
  });
})();
