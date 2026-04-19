(function() {
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  const STORY_ID = window.location.pathname.match(/\/panel\/stories\/([^\/]+)\/edit/)?.[1];
  const PATCH_DEBOUNCE_MS = 600;
  let patchTimer = null;
  let lastSentChaptersSnapshot = null;

  function persistChapters() {
    if (!STORY_ID) return; // yeni hikaye modunda stories-edit.js önce POST yapar
    clearTimeout(patchTimer);
    patchTimer = setTimeout(async () => {
      try {
        const chapters = window.__story?.chapters || [];
        const snapshot = JSON.stringify(chapters);
        if (snapshot === lastSentChaptersSnapshot) return; // değişim yoksa atlama
        await window.panelApi.patch(`/panel/api/stories/${STORY_ID}`, { chapters });
        lastSentChaptersSnapshot = snapshot;
      } catch (err) {
        console.error(err);
        window.panelToast?.error(`Bölüm kaydedilemedi: ${err?.body?.message || err.message}`);
        lastSentChaptersSnapshot = null;
      }
    }, PATCH_DEBOUNCE_MS);
  }

  function renderChapters() {
    const container = document.getElementById('chapters-list');
    const empty = document.getElementById('chapters-empty');
    if (!container || !window.__story) return;

    const chapters = window.__story.chapters || [];
    if (chapters.length === 0) {
      empty?.classList.remove('hidden');
      container.querySelectorAll('.chapter-card').forEach(el => el.remove());
      return;
    }
    empty?.classList.add('hidden');
    container.querySelectorAll('.chapter-card').forEach(el => el.remove());

    chapters.forEach((ch, ci) => {
      const card = document.createElement('div');
      card.className = 'chapter-card kt-card';
      card.dataset.index = ci;
      const scenes = ch.scenes || [];
      card.innerHTML = `
        <div class="kt-card-content p-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-sm font-medium text-muted-foreground">#${ci + 1}</span>
            <input class="kt-input chapter-title flex-1" placeholder="Bölüm başlığı" value="${esc(ch.title || '')}"/>
            <button type="button" class="kt-btn kt-btn-sm kt-btn-ghost chapter-move-up" ${ci === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="kt-btn kt-btn-sm kt-btn-ghost chapter-move-down" ${ci === chapters.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="kt-btn kt-btn-sm kt-btn-destructive chapter-remove">Sil</button>
          </div>
          <textarea class="kt-input chapter-summary mb-3" rows="2" placeholder="Bölüm özeti (AI'a bağlam olarak gider)">${esc(ch.summary || '')}</textarea>

          <!-- Chapter transition directive — AI'ı yönlendiren yapılandırılmış direktif -->
          <div class="mb-3 rounded-md border border-border p-3" style="background:rgba(59,130,246,0.04);">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-sm font-semibold">🎬 Bölüm Geçiş Direktifi</span>
              <span class="text-xs text-muted-foreground">— AI bu alanlara göre doğal açılış sahnesi üretir</span>
            </div>
            <div class="flex items-center gap-2 mb-3">
              <label class="text-xs text-muted-foreground shrink-0">Dil:</label>
              <select class="kt-input chapter-directive-locale" style="max-width:120px;">
                <option value="en">EN</option>
                <option value="tr">TR</option>
                <option value="ar">AR</option>
                <option value="de">DE</option>
                <option value="es">ES</option>
                <option value="fr">FR</option>
                <option value="it">IT</option>
                <option value="ja">JA</option>
                <option value="ko">KO</option>
                <option value="pt">PT</option>
                <option value="ru">RU</option>
                <option value="zh">ZH</option>
              </select>
              <span class="text-xs text-muted-foreground">Seçili dil için direktif alanları</span>
            </div>
            <div class="grid gap-2">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">⏱ Zaman geçişi</label>
                <input class="kt-input chapter-directive-timeDelta" placeholder="Örn: 3 ay sonra / ertesi sabah / yıllar geçti"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">📍 Konum</label>
                <input class="kt-input chapter-directive-location" placeholder="Örn: Ev, oturma odası, akşam, pencereye vuran yağmur"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">🎭 Ruh hali</label>
                <input class="kt-input chapter-directive-mood" placeholder="Örn: Melankolik yansıma / heyecanlı bekleyiş"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">🔗 Önceki bölümden taşınacaklar</label>
                <input class="kt-input chapter-directive-carryOver" placeholder="Örn: Mira ile bağ — artık mesafeli, telefon numarası telefonda"/>
              </div>
            </div>
            <p class="text-xs text-muted-foreground mt-2">
              <strong>İpucu:</strong> Alanlar boş bırakılırsa AI yalnızca bölüm özetine bakarak yazar. Time jump / location change için alanları doldurmak önerilir.
            </p>
          </div>

          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium">Sahneler (${scenes.length})</span>
            <button type="button" class="kt-btn kt-btn-xs kt-btn-outline scene-add">+ Sahne</button>
          </div>
          <div class="scenes-list flex flex-col gap-2">
            ${scenes.map((sc, si) => `
              <div class="scene-item border border-border rounded p-3" data-scene-index="${si}">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-xs text-muted-foreground">S${si + 1}</span>
                  <input class="kt-input scene-title flex-1" placeholder="Sahne adı" value="${esc(sc.title || '')}"/>
                  <button type="button" class="kt-btn kt-btn-xs kt-btn-destructive scene-remove">×</button>
                </div>
                <textarea class="kt-input scene-description" rows="2" placeholder="Açıklama">${esc(sc.description || '')}</textarea>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    wireEvents();
  }

  function wireEvents() {
    document.querySelectorAll('.chapter-card').forEach(card => {
      const ci = parseInt(card.dataset.index, 10);
      card.querySelector('.chapter-title').addEventListener('input', e => {
        window.__story.chapters[ci].title = e.target.value;
        persistChapters();
      });
      card.querySelector('.chapter-summary').addEventListener('input', e => {
        window.__story.chapters[ci].summary = e.target.value;
        persistChapters();
      });

      // Chapter transition directive — multi-locale, 4 alan (timeDelta, location, mood, carryOver)
      const dirLocale = card.querySelector('.chapter-directive-locale');
      const dirFields = ['timeDelta', 'location', 'mood', 'carryOver'];
      const dirInputs = {};
      dirFields.forEach(k => {
        dirInputs[k] = card.querySelector(`.chapter-directive-${k}`);
      });

      function loadDirectiveForLocale() {
        const locale = dirLocale.value;
        const ch = window.__story.chapters[ci];
        const translations = ch.transitionDirectiveTranslations || {};
        const source = locale === 'en'
          ? (translations.en || ch.transitionDirective || {})
          : (translations[locale] || {});
        dirFields.forEach(k => {
          dirInputs[k].value = source[k] || '';
        });
      }

      dirLocale.addEventListener('change', loadDirectiveForLocale);

      dirFields.forEach(k => {
        dirInputs[k].addEventListener('input', e => {
          const locale = dirLocale.value;
          const ch = window.__story.chapters[ci];
          if (!ch.transitionDirectiveTranslations) ch.transitionDirectiveTranslations = {};
          if (!ch.transitionDirectiveTranslations[locale]) ch.transitionDirectiveTranslations[locale] = {};
          ch.transitionDirectiveTranslations[locale][k] = e.target.value;
          // EN her zaman flat transitionDirective ile senkron (backend fallback)
          if (locale === 'en') {
            if (!ch.transitionDirective) ch.transitionDirective = {};
            ch.transitionDirective[k] = e.target.value;
          }
          persistChapters();
        });
      });

      // İlk render'da EN değerlerini yükle
      loadDirectiveForLocale();
      card.querySelector('.chapter-remove').addEventListener('click', () => {
        if (!confirm('Bölüm silinsin mi?')) return;
        window.__story.chapters.splice(ci, 1);
        renderChapters();
        persistChapters();
      });
      card.querySelector('.chapter-move-up')?.addEventListener('click', () => {
        if (ci === 0) return;
        const arr = window.__story.chapters;
        [arr[ci-1], arr[ci]] = [arr[ci], arr[ci-1]];
        renderChapters();
        persistChapters();
      });
      card.querySelector('.chapter-move-down')?.addEventListener('click', () => {
        const arr = window.__story.chapters;
        if (ci === arr.length - 1) return;
        [arr[ci+1], arr[ci]] = [arr[ci], arr[ci+1]];
        renderChapters();
        persistChapters();
      });
      card.querySelector('.scene-add').addEventListener('click', () => {
        window.__story.chapters[ci].scenes = window.__story.chapters[ci].scenes || [];
        window.__story.chapters[ci].scenes.push({ title: '', description: '', mediaItems: [] });
        renderChapters();
        persistChapters();
      });
      card.querySelectorAll('.scene-item').forEach(scEl => {
        const si = parseInt(scEl.dataset.sceneIndex, 10);
        scEl.querySelector('.scene-title').addEventListener('input', e => {
          window.__story.chapters[ci].scenes[si].title = e.target.value;
          persistChapters();
        });
        scEl.querySelector('.scene-description').addEventListener('input', e => {
          window.__story.chapters[ci].scenes[si].description = e.target.value;
          persistChapters();
        });
        scEl.querySelector('.scene-remove').addEventListener('click', () => {
          window.__story.chapters[ci].scenes.splice(si, 1);
          renderChapters();
          persistChapters();
        });
      });
    });
  }

  document.getElementById('btn-add-chapter')?.addEventListener('click', () => {
    if (!window.__story) window.__story = {};
    window.__story.chapters = window.__story.chapters || [];
    window.__story.chapters.push({ title: '', summary: '', scenes: [] });
    renderChapters();
    persistChapters();
  });

  setTimeout(() => { if (window.__story) renderChapters(); }, 700);
  setTimeout(() => { if (window.__story) renderChapters(); }, 1500);
})();
