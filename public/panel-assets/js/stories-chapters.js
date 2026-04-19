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
          <textarea class="kt-input chapter-summary mb-3" rows="2" placeholder="Bölüm özeti">${esc(ch.summary || '')}</textarea>
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
