(function() {
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function sortByOrder(arr) {
    return arr.slice().sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));
  }

  function renderLegacyMedia(images, videos) {
    if ((!images || images.length === 0) && (!videos || videos.length === 0)) return '';
    let html = '<div class="mt-5 pt-5 border-t border-border flex flex-col gap-5">';
    html += '<div class="flex items-center gap-2"><span class="kt-badge kt-badge-sm kt-badge-outline">Legacy</span><span class="text-xs text-muted-foreground">Firestore formatı — readonly, migration sonrası kaldırılacak</span></div>';

    if (images && images.length > 0) {
      const sorted = sortByOrder(images);
      html += `
        <div>
          <div class="text-sm font-medium mb-2">Legacy Görseller (${sorted.length})</div>
          <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            ${sorted.map(img => {
              const src = esc(img.thumbnail || img.url || '');
              const full = esc(img.url || '');
              const isHidden = img.hidden === true;
              const wrapperClass = isHidden ? 'opacity-40' : '';
              const badge = isHidden ? '<span class="absolute top-1 left-1 kt-badge kt-badge-xs kt-badge-warning">gizli</span>' : '';
              return `
                <a href="${full}" target="_blank" rel="noopener" class="relative block aspect-square rounded border border-border overflow-hidden bg-muted ${wrapperClass}">
                  <img src="${src}" alt="" class="w-full h-full object-cover max-h-24" loading="lazy"/>
                  ${badge}
                </a>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    if (videos && videos.length > 0) {
      const sorted = sortByOrder(videos);
      html += `
        <div>
          <div class="text-sm font-medium mb-2">Legacy Videolar (${sorted.length})</div>
          <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            ${sorted.map(v => {
              const thumb = esc(v.thumbnail || '');
              const full = esc(v.url || '');
              return `
                <a href="${full}" target="_blank" rel="noopener" class="relative block aspect-square rounded border border-border overflow-hidden bg-muted">
                  ${thumb ? `<img src="${thumb}" alt="" class="w-full h-full object-cover max-h-24" loading="lazy"/>` : '<div class="w-full h-full bg-muted"></div>'}
                  <span class="absolute inset-0 flex items-center justify-center bg-black/30">
                    <i class="ki-filled ki-play text-white text-2xl"></i>
                  </span>
                </a>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    html += '</div>';
    return html;
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
      const legacyImages = (ch.mediaAssets && Array.isArray(ch.mediaAssets.images)) ? ch.mediaAssets.images : [];
      const legacyVideos = (ch.mediaAssets && Array.isArray(ch.mediaAssets.videos)) ? ch.mediaAssets.videos : [];
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
          ${renderLegacyMedia(legacyImages, legacyVideos)}
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
      });
      card.querySelector('.chapter-summary').addEventListener('input', e => {
        window.__story.chapters[ci].summary = e.target.value;
      });
      card.querySelector('.chapter-remove').addEventListener('click', () => {
        if (!confirm('Bölüm silinsin mi?')) return;
        window.__story.chapters.splice(ci, 1);
        renderChapters();
      });
      card.querySelector('.chapter-move-up')?.addEventListener('click', () => {
        if (ci === 0) return;
        const arr = window.__story.chapters;
        [arr[ci-1], arr[ci]] = [arr[ci], arr[ci-1]];
        renderChapters();
      });
      card.querySelector('.chapter-move-down')?.addEventListener('click', () => {
        const arr = window.__story.chapters;
        if (ci === arr.length - 1) return;
        [arr[ci+1], arr[ci]] = [arr[ci], arr[ci+1]];
        renderChapters();
      });
      card.querySelector('.scene-add').addEventListener('click', () => {
        window.__story.chapters[ci].scenes = window.__story.chapters[ci].scenes || [];
        window.__story.chapters[ci].scenes.push({ title: '', description: '', mediaItems: [] });
        renderChapters();
      });
      card.querySelectorAll('.scene-item').forEach(scEl => {
        const si = parseInt(scEl.dataset.sceneIndex, 10);
        scEl.querySelector('.scene-title').addEventListener('input', e => {
          window.__story.chapters[ci].scenes[si].title = e.target.value;
        });
        scEl.querySelector('.scene-description').addEventListener('input', e => {
          window.__story.chapters[ci].scenes[si].description = e.target.value;
        });
        scEl.querySelector('.scene-remove').addEventListener('click', () => {
          window.__story.chapters[ci].scenes.splice(si, 1);
          renderChapters();
        });
      });
    });
  }

  document.getElementById('btn-add-chapter')?.addEventListener('click', () => {
    if (!window.__story) window.__story = {};
    window.__story.chapters = window.__story.chapters || [];
    window.__story.chapters.push({ title: '', summary: '', scenes: [] });
    renderChapters();
  });

  setTimeout(() => { if (window.__story) renderChapters(); }, 700);
  setTimeout(() => { if (window.__story) renderChapters(); }, 1500);
})();
