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

  // ===== Basic tab (STORY-11): multi-locale title/summary + metadata =====
  const LOCALES = ['en','tr','ar','de','es','fr','it','ja','ko','pt','ru','zh'];
  let currentLocale = 'en';

  function renderBadges(story) {
    const el = document.getElementById('locale-badges');
    if (!el) return;
    el.innerHTML = LOCALES.map(l => {
      const filled = !!(story?.translations?.[l]?.title);
      return `<span class="kt-badge ${filled ? 'kt-badge-success' : 'kt-badge-outline'}">${l.toUpperCase()}${filled ? ' ✓' : ''}</span>`;
    }).join('');
  }

  function loadLocale(locale) {
    currentLocale = locale;
    const t = window.__story?.translations?.[locale] || {};
    document.getElementById('f-title').value = t.title || (locale === 'en' ? window.__story?.title : '') || '';
    document.getElementById('f-summary').value = t.summary || (locale === 'en' ? window.__story?.summary : '') || '';
    document.getElementById('f-summary-safe').value = t.summarySafe || (locale === 'en' ? window.__story?.summarySafe : '') || '';
    document.querySelectorAll('.locale-label').forEach(el => el.textContent = locale.toUpperCase());
  }

  function captureLocale() {
    if (!window.__story) return;
    window.__story.translations = window.__story.translations || {};
    window.__story.translations[currentLocale] = {
      title: document.getElementById('f-title').value,
      summary: document.getElementById('f-summary').value,
      summarySafe: document.getElementById('f-summary-safe').value,
    };
    // EN değişince flat title/summary de güncelle (backend compat)
    if (currentLocale === 'en') {
      window.__story.title = document.getElementById('f-title').value;
      window.__story.summary = document.getElementById('f-summary').value;
      window.__story.summarySafe = document.getElementById('f-summary-safe').value;
    }
  }

  document.getElementById('locale-select')?.addEventListener('change', e => {
    captureLocale();
    loadLocale(e.target.value);
    renderBadges(window.__story);
  });

  ['f-title','f-summary','f-summary-safe'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      captureLocale();
      renderBadges(window.__story);
    });
  });

  ['f-genre','f-difficulty','f-age','f-credit-cost','f-is-paid','f-is-published'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const handler = () => {
      if (!window.__story) return;
      const val = el.type === 'checkbox' ? el.checked : el.value;
      const key = { 'f-genre': 'genre', 'f-difficulty': 'difficulty', 'f-age': 'ageRating', 'f-credit-cost': 'creditCost', 'f-is-paid': 'isPaid', 'f-is-published': 'isPublished' }[id];
      window.__story[key] = id === 'f-credit-cost' ? parseFloat(val) || 0 : val;
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });

  function applyStoryToBasicTab() {
    if (!window.__story) return;
    document.getElementById('f-genre').value = window.__story.genre || '';
    document.getElementById('f-difficulty').value = window.__story.difficulty || '';
    document.getElementById('f-age').value = window.__story.ageRating || '';
    document.getElementById('f-credit-cost').value = window.__story.creditCost ?? 0;
    document.getElementById('f-is-paid').checked = !!window.__story.isPaid;
    document.getElementById('f-is-published').checked = !!window.__story.isPublished;
    loadLocale('en');
    renderBadges(window.__story);
  }

  setTimeout(() => { if (window.__story) applyStoryToBasicTab(); }, 500);
  setTimeout(() => { if (window.__story) applyStoryToBasicTab(); }, 1500);
})();
