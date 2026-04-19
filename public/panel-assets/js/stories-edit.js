(function() {
  const STORY_ID = window.location.pathname.match(/\/panel\/stories\/([^\/]+)\/edit/)?.[1];
  const IS_NEW = window.location.pathname.endsWith('/stories/new');

  let dirty = false;
  const banner = document.getElementById('dirty-banner');

  function setDirty(v) {
    dirty = v;
    banner.classList.toggle('hidden', !v);
  }

  // Tab switch
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(b => {
        b.classList.toggle('border-b-2', b.dataset.tab === tab);
        b.classList.toggle('border-primary', b.dataset.tab === tab);
        b.classList.toggle('text-primary', b.dataset.tab === tab);
        b.classList.toggle('text-muted-foreground', b.dataset.tab !== tab);
      });
      document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('hidden', p.dataset.tab !== tab);
      });
    });
  });

  // Dirty tracking on any input change inside tab panels
  document.addEventListener('input', e => {
    if (e.target.closest('.tab-panel')) setDirty(true);
  });

  // beforeunload
  window.addEventListener('beforeunload', e => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Load existing story data
  if (STORY_ID && !IS_NEW) {
    window.panelApi.get(`/panel/api/stories/${STORY_ID}`).then(story => {
      window.__story = story; // sub-tabs buradan okusun
    }).catch(() => {
      window.panelToast?.error('Hikaye yüklenemedi');
    });
  } else {
    window.__story = {};
  }

  // Save handler - payload aggregator (sub-tabs kendi alanlarını window.__story'ye yazar)
  async function save(asDraft = false) {
    if (!window.__story) return;
    const payload = { ...window.__story };
    if (asDraft) payload.isPublished = false;
    const saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true;
    try {
      if (IS_NEW) {
        const created = await window.panelApi.post('/panel/api/stories', payload);
        window.panelToast?.success('Oluşturuldu');
        setDirty(false);
        setTimeout(() => window.location.href = `/panel/stories/${created._id}/edit`, 800);
      } else {
        await window.panelApi.patch(`/panel/api/stories/${STORY_ID}`, payload);
        window.panelToast?.success('Kaydedildi');
        setDirty(false);
      }
    } catch {
    } finally {
      saveBtn.disabled = false;
    }
  }
  document.getElementById('save-btn').addEventListener('click', () => save(false));
  document.getElementById('draft-btn').addEventListener('click', () => save(true));
})();
