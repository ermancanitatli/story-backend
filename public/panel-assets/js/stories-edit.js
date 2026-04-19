(function() {
  let STORY_ID = window.location.pathname.match(/\/panel\/stories\/([^\/]+)\/edit/)?.[1];
  let IS_NEW = window.location.pathname.endsWith('/stories/new');

  // ===== Debounced inline save =====
  const PATCH_DEBOUNCE_MS = 600;
  const patchTimers = new Map(); // key => timerId
  const lastSentValues = new Map(); // key => JSON stringified son gönderilen değer

  function showSavedToast() {
    const t = window.panelToast;
    if (!t) return;
    if (typeof t.info === 'function') t.info('✓ Kaydedildi', { duration: 800 });
    else if (typeof t.success === 'function') t.success('✓ Kaydedildi', { duration: 800 });
  }

  function showErrorToast(err) {
    const msg = err?.body?.message || err?.message || 'Bilinmeyen hata';
    window.panelToast?.error?.(`Kaydedilemedi: ${msg}`);
  }

  // Her alan için ayrı debounce timer'ı + son gönderilen değere göre dedupe
  function scheduleFieldPatch(key, bodyBuilder) {
    if (!STORY_ID || IS_NEW) return;
    const existing = patchTimers.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(async () => {
      patchTimers.delete(key);
      try {
        const body = typeof bodyBuilder === 'function' ? bodyBuilder() : bodyBuilder;
        if (!body || Object.keys(body).length === 0) return;

        // Değişim kontrolü — önceki gönderimle aynıysa request atma
        const snapshot = JSON.stringify(body);
        if (lastSentValues.get(key) === snapshot) return;

        await window.panelApi.patch(`/panel/api/stories/${STORY_ID}`, body);
        lastSentValues.set(key, snapshot);
        showSavedToast();
      } catch (err) {
        console.error('[stories-edit] patch failed', key, err);
        showErrorToast(err);
        // Hata durumunda son gönderim cache'ini temizle ki bir sonraki girişim tekrar dene
        lastSentValues.delete(key);
      }
    }, PATCH_DEBOUNCE_MS);
    patchTimers.set(key, t);
  }

  function patchField(key, value) {
    scheduleFieldPatch(key, () => ({ [key]: value }));
  }

  function patchFieldMany(keyGroup, body) {
    // keyGroup: unique debounce bucket key (ör: 'translations')
    scheduleFieldPatch(keyGroup, () => body);
  }

  // ===== IS_NEW: create-on-first-change =====
  let creatingStory = false;
  async function ensureStoryExistsThenContinue() {
    if (STORY_ID && !IS_NEW) return true;
    if (creatingStory) return false;

    const enTitle = document.getElementById('f-title')?.value?.trim() || window.__story?.translations?.en?.title?.trim() || '';
    if (!enTitle) {
      window.panelToast?.warn?.('Önce EN başlığı girin') || window.panelToast?.info?.('Önce EN başlığı girin');
      return false;
    }

    creatingStory = true;
    try {
      const payload = {
        translations: { en: { title: enTitle } },
        genre: window.__story?.genre || 'other',
        isPaid: !!window.__story?.isPaid,
      };
      const created = await window.panelApi.post('/panel/api/stories', payload);
      window.panelToast?.success?.('Hikaye oluşturuldu, düzenleme devam ediyor');
      // redirect — sayfa yenilendikten sonra inline save STORY_ID ile çalışır
      window.location.replace(`/panel/stories/${created._id}/edit`);
      return true;
    } catch (err) {
      console.error('[stories-edit] create failed', err);
      showErrorToast(err);
      creatingStory = false;
      return false;
    }
  }

  // ===== Tab switch =====
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

  // ===== Load existing story data =====
  if (STORY_ID && !IS_NEW) {
    window.panelApi.get(`/panel/api/stories/${STORY_ID}`).then(story => {
      window.__story = story;
    }).catch(() => {
      window.panelToast?.error('Hikaye yüklenemedi');
    });
  } else {
    window.__story = {};
  }

  // ===== Settings tab: tags + SEO + metadata =====
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
        patchField('tags', window.__story.tags);
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
        if (!window.__story.tags.includes(val)) {
          window.__story.tags.push(val);
          patchField('tags', window.__story.tags);
        }
        e.target.value = '';
        renderTags(window.__story.tags);
      }
    }
  });

  const SETTINGS_FIELDS = {
    'f-meta-title': 'metaTitle',
    'f-meta-description': 'metaDescription',
    'f-internal-notes': 'internalNotes',
  };
  Object.entries(SETTINGS_FIELDS).forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('input', () => {
      if (!window.__story) return;
      const val = document.getElementById(id).value;
      window.__story[key] = val;
      patchField(key, val);
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

  // ===== Basic tab: multi-locale title/summary + metadata =====
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

  function captureLocaleToStory() {
    if (!window.__story) return;
    window.__story.translations = window.__story.translations || {};
    const tTitle = document.getElementById('f-title').value;
    const tSummary = document.getElementById('f-summary').value;
    const tSummarySafe = document.getElementById('f-summary-safe').value;
    window.__story.translations[currentLocale] = {
      title: tTitle,
      summary: tSummary,
      summarySafe: tSummarySafe,
    };
    if (currentLocale === 'en') {
      window.__story.title = tTitle;
      window.__story.summary = tSummary;
      window.__story.summarySafe = tSummarySafe;
    }
  }

  function patchCurrentLocale() {
    if (!window.__story) return;
    const body = { translations: window.__story.translations };
    if (currentLocale === 'en') {
      body.title = window.__story.title || '';
      body.summary = window.__story.summary || '';
      body.summarySafe = window.__story.summarySafe || '';
    }
    patchFieldMany('translations', body);
  }

  document.getElementById('locale-select')?.addEventListener('change', e => {
    captureLocaleToStory();
    // switch locale — önceki locale için bekleyen patch hâlâ timer'da; bırak son halini göndersin
    loadLocale(e.target.value);
    renderBadges(window.__story);
  });

  ['f-title','f-summary','f-summary-safe'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', async () => {
      if (IS_NEW && !STORY_ID) {
        // EN title dolu ise create flow'u tetikle (yalnızca f-title için anlamlı)
        if (id === 'f-title') {
          // create-on-first-change — redirect yapacak
          const ok = await ensureStoryExistsThenContinue();
          if (!ok) return;
        }
        return;
      }
      captureLocaleToStory();
      renderBadges(window.__story);
      patchCurrentLocale();
    });
  });

  const BASIC_META_FIELDS = {
    'f-genre': 'genre',
    'f-difficulty': 'difficulty',
    'f-age': 'ageRating',
    'f-credit-cost': 'creditCost',
    'f-is-paid': 'isPaid',
    'f-is-published': 'isPublished',
  };
  Object.entries(BASIC_META_FIELDS).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const handler = () => {
      if (!window.__story) return;
      let val;
      if (el.type === 'checkbox') {
        val = el.checked;
      } else if (id === 'f-credit-cost') {
        val = parseFloat(el.value);
        if (isNaN(val)) val = 0;
      } else if (id === 'f-difficulty') {
        val = el.value === '' ? null : el.value;
      } else {
        val = el.value;
      }
      window.__story[key] = val;
      if (IS_NEW && !STORY_ID) return; // yeni hikaye henüz create edilmedi; lokalde tut
      patchField(key, val);
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
