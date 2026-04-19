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

  // ===== Settings tab (STORY-16): tags + SEO + metadata =====
  function renderTags(tags) {
    const wrapper = document.getElementById('tags-wrapper');
    const input = document.getElementById('tags-input');
    if (!wrapper || !input) return;
    wrapper.querySelectorAll('.tag-chip').forEach(el => el.remove());
    (tags || []).forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-primary/10 text-primary';
      chip.innerHTML = `${tag}<button type="button" class="ml-1 hover:text-destructive">×</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        window.__story.tags = (window.__story.tags || []).filter(t => t !== tag);
        renderTags(window.__story.tags);
      });
      wrapper.insertBefore(chip, input);
    });
  }

  document.getElementById('tags-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim().replace(/,/g, '');
      if (val && window.__story) {
        window.__story.tags = window.__story.tags || [];
        if (!window.__story.tags.includes(val)) window.__story.tags.push(val);
        e.target.value = '';
        renderTags(window.__story.tags);
      }
    }
  });

  ['f-meta-title','f-meta-description','f-internal-notes'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      if (!window.__story) return;
      const val = document.getElementById(id).value;
      const key = { 'f-meta-title': 'metaTitle', 'f-meta-description': 'metaDescription', 'f-internal-notes': 'internalNotes' }[id];
      window.__story[key] = val;
    });
  });

  function applyStoryToSettings() {
    if (!window.__story) return;
    document.getElementById('f-legacy-id').value = window.__story.legacyFirestoreId || '—';
    document.getElementById('f-meta-title').value = window.__story.metaTitle || '';
    document.getElementById('f-meta-description').value = window.__story.metaDescription || '';
    document.getElementById('f-internal-notes').value = window.__story.internalNotes || '';
    renderTags(window.__story.tags);
  }

  setTimeout(() => { if (window.__story) applyStoryToSettings(); }, 500);
  setTimeout(() => { if (window.__story) applyStoryToSettings(); }, 1500);
})();
