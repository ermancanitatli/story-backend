/**
 * Chapter-bazlı medya yönetimi + cover upload.
 * - Sol panel: chapter listesi (seçili chapter highlight)
 * - Sağ panel: seçili chapter'ın medyası, Görseller / Videolar sub-tab
 * - Lightbox modal: tam-ekran preview + alt/title/order/hidden düzenleme
 * - URL param `?chapter=N` ile seçim persist eder
 * - Upload: presign (chapter-aware) → S3 PUT → POST /media (dual-write scenes + mediaItems)
 */
(function () {
  const STORY_ID = window.location.pathname.match(/\/panel\/stories\/([^\/]+)\/edit/)?.[1];

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
    );

  function isVideoItem(item) {
    if (!item) return false;
    if (item.mimeType?.startsWith?.('video/')) return true;
    if (item.title === 'legacy_video') return true;
    const url = (item.url || '').toLowerCase().split('?')[0];
    return url.endsWith('.mp4') || url.endsWith('.mov') || url.endsWith('.webm');
  }

  // ===== STATE =====
  const state = {
    selectedChapter: 0,
    mediaTab: 'images', // 'images' | 'videos'
  };

  function readInitialParams() {
    const params = new URLSearchParams(window.location.search);
    const ch = parseInt(params.get('chapter'), 10);
    if (!Number.isNaN(ch) && ch >= 0) state.selectedChapter = ch;
    const mt = params.get('mediaTab');
    if (mt === 'images' || mt === 'videos') state.mediaTab = mt;
  }

  function updateUrlParams() {
    const params = new URLSearchParams(window.location.search);
    params.set('chapter', String(state.selectedChapter));
    params.set('mediaTab', state.mediaTab);
    const url = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', url);
  }

  // ===== COVER (aynı davranış) =====
  async function resizeToWebP(file, maxDim) {
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
    canvas.width = img.width * ratio;
    canvas.height = img.height * ratio;
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.9));
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  const cover = {
    dropzone: document.getElementById('cover-dropzone'),
    input: document.getElementById('cover-input'),
    preview: document.getElementById('cover-preview'),
    placeholder: document.getElementById('cover-placeholder'),
    img: document.getElementById('cover-img'),
  };

  function showCover(url) {
    if (!cover.img) return;
    cover.img.src = url;
    cover.preview?.classList.remove('hidden');
    cover.placeholder?.classList.add('hidden');
  }

  async function uploadCover(file) {
    if (!STORY_ID) {
      window.panelToast?.error('Önce hikayeyi kaydet');
      return null;
    }
    const webpBlob = await resizeToWebP(file, 1920);
    const thumbBlob = await resizeToWebP(file, 512);
    const presign = await window.panelApi.post(`/panel/api/stories/${STORY_ID}/images/presign`, {
      contentType: 'image/webp',
      kind: 'cover',
    });
    await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: webpBlob });
    const thumbPresign = await window.panelApi.post(`/panel/api/stories/${STORY_ID}/images/presign`, {
      contentType: 'image/webp',
      kind: 'cover',
    });
    await fetch(thumbPresign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: thumbBlob });
    return { url: presign.publicUrl, thumbnail: thumbPresign.publicUrl, imageId: presign.imageId };
  }

  cover.dropzone?.addEventListener('click', (e) => {
    if (!e.target.closest('button')) cover.input?.click();
  });
  cover.dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    cover.dropzone.classList.add('bg-muted/30');
  });
  cover.dropzone?.addEventListener('dragleave', () => cover.dropzone.classList.remove('bg-muted/30'));
  cover.dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    cover.dropzone.classList.remove('bg-muted/30');
    if (e.dataTransfer.files[0]) handleCover(e.dataTransfer.files[0]);
  });
  cover.input?.addEventListener('change', (e) => {
    if (e.target.files[0]) handleCover(e.target.files[0]);
  });

  async function handleCover(file) {
    const progress = document.getElementById('cover-progress');
    progress?.classList.remove('hidden');
    try {
      const uploaded = await uploadCover(file);
      if (!uploaded) return;
      showCover(uploaded.url);
      if (!window.__story) window.__story = {};
      window.__story.coverImage = [
        { _id: uploaded.imageId, url: uploaded.url, thumbnail: uploaded.thumbnail, order: 0 },
      ];
      window.panelToast?.success('Kapak yüklendi');
    } catch (err) {
      console.error(err);
      window.panelToast?.error('Yükleme başarısız');
    } finally {
      progress?.classList.add('hidden');
    }
  }

  document.getElementById('cover-replace')?.addEventListener('click', () => cover.input?.click());
  document.getElementById('cover-remove')?.addEventListener('click', () => {
    if (!confirm('Kapak kaldırılsın mı?')) return;
    if (window.__story) window.__story.coverImage = [];
    cover.preview?.classList.add('hidden');
    cover.placeholder?.classList.remove('hidden');
  });

  setTimeout(() => {
    const url = window.__story?.coverImage?.[0]?.url;
    if (url) showCover(url);
  }, 700);

  // ===== CHAPTER MEDIA =====
  const chapterList = document.getElementById('chapter-list');
  const chapterTitle = document.getElementById('chapter-media-title');
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryEmpty = document.getElementById('gallery-empty');
  const galleryDrop = document.getElementById('gallery-dropzone');
  const galleryInput = document.getElementById('gallery-input');
  const countImages = document.getElementById('media-count-images');
  const countVideos = document.getElementById('media-count-videos');
  const uploadKindLabel = document.getElementById('upload-kind-label');

  function chapters() {
    return window.__story?.chapters || [];
  }

  function currentChapter() {
    return chapters()[state.selectedChapter];
  }

  function chapterMediaItems(ch) {
    return Array.isArray(ch?.mediaItems) ? ch.mediaItems : [];
  }

  function renderChapterList() {
    if (!chapterList) return;
    const chs = chapters();
    if (chs.length === 0) {
      chapterList.innerHTML =
        '<li class="px-4 py-3 text-sm text-muted-foreground">Henüz bölüm yok.</li>';
      return;
    }
    if (state.selectedChapter >= chs.length) state.selectedChapter = 0;

    chapterList.innerHTML = chs
      .map((ch, i) => {
        const items = chapterMediaItems(ch);
        const imgs = items.filter((m) => !isVideoItem(m)).length;
        const vids = items.filter(isVideoItem).length;
        const active = i === state.selectedChapter;
        return `
          <li>
            <button type="button" data-chapter-idx="${i}"
              class="chapter-li w-full text-left px-4 py-2.5 flex items-center gap-3 transition ${active ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted/30 border-l-2 border-transparent'}">
              <span class="text-xs font-semibold text-muted-foreground w-5 text-center">${i + 1}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate ${active ? 'text-primary' : ''}">${esc(ch.title || 'Bölüm ' + (i + 1))}</div>
                <div class="text-xs text-muted-foreground mt-0.5">📷 ${imgs} · 🎬 ${vids}</div>
              </div>
            </button>
          </li>
        `;
      })
      .join('');

    chapterList.querySelectorAll('[data-chapter-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.chapterIdx, 10);
        if (idx === state.selectedChapter) return;
        state.selectedChapter = idx;
        updateUrlParams();
        renderChapterList();
        renderGrid();
      });
    });
  }

  function renderGrid() {
    if (!galleryGrid) return;
    const ch = currentChapter();
    if (!ch) {
      galleryGrid.innerHTML = '';
      if (chapterTitle) chapterTitle.textContent = 'Bir bölüm seçin';
      if (countImages) countImages.textContent = '0';
      if (countVideos) countVideos.textContent = '0';
      galleryEmpty?.classList.add('hidden');
      return;
    }

    if (chapterTitle) {
      chapterTitle.textContent = `Bölüm ${state.selectedChapter + 1}: ${ch.title || ''}`;
    }

    const all = chapterMediaItems(ch)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const imgs = all.filter((m) => !isVideoItem(m));
    const vids = all.filter(isVideoItem);

    if (countImages) countImages.textContent = String(imgs.length);
    if (countVideos) countVideos.textContent = String(vids.length);
    if (uploadKindLabel) {
      uploadKindLabel.textContent = state.mediaTab === 'videos' ? 'Videolar' : 'Görseller';
    }
    if (galleryInput) {
      galleryInput.accept =
        state.mediaTab === 'videos'
          ? 'video/mp4,video/webm,video/quicktime'
          : 'image/jpeg,image/png,image/webp';
    }

    const items = state.mediaTab === 'videos' ? vids : imgs;
    if (items.length === 0) {
      galleryGrid.innerHTML = '';
      galleryEmpty?.classList.remove('hidden');
      return;
    }
    galleryEmpty?.classList.add('hidden');

    galleryGrid.innerHTML = items
      .map((m, idx) => {
        const isVid = isVideoItem(m);
        const hidden = m.hidden === true;
        const thumbRaw = m.thumbnail || '';
        const url = esc(m.url || '');
        const thumbIsImage = thumbRaw && /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(thumbRaw.split('?')[0]);
        const thumb = thumbIsImage ? esc(thumbRaw) : '';
        const orderBadge = `<span class="absolute top-1.5 left-1.5 rounded-md bg-black/70 text-white text-xs font-semibold px-1.5 py-0.5 z-10">#${idx + 1}</span>`;
        const hiddenBadge = hidden
          ? '<span class="absolute bottom-1.5 right-1.5 kt-badge kt-badge-xs kt-badge-warning z-10">Gizli</span>'
          : '';
        const videoBadge = isVid
          ? '<span class="absolute bottom-1.5 left-1.5 kt-badge kt-badge-xs kt-badge-primary z-10"><i class="ki-filled ki-play"></i> Video</span>'
          : '';
        const dragHandle = `<span class="media-drag absolute top-1.5 left-10 size-6 rounded-md bg-black/60 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-10 cursor-grab" title="Sürükle sıralamak için">⋮⋮</span>`;
        const inner = isVid
          ? `
              <video src="${url}#t=0.5" ${thumb ? `poster="${thumb}"` : ''} style="max-height:300px;width:auto;max-width:100%;" class="object-contain bg-black block" preload="metadata" muted playsinline></video>
              <span class="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/10 transition pointer-events-none">
                <i class="ki-filled ki-play text-white text-3xl drop-shadow-lg"></i>
              </span>
            `
          : `<img src="${thumb || url}" alt="${esc(m.alt || '')}" style="max-height:300px;width:auto;max-width:100%;" class="object-contain block" loading="lazy"/>`;

        const hideIcon = hidden ? 'ki-eye' : 'ki-eye-slash';
        const hideTitle = hidden ? 'Görünür yap' : 'Gizle';
        const hideBtnColor = hidden ? 'bg-warning' : 'bg-black/70';
        return `
          <div class="media-card group relative rounded-lg border border-border overflow-hidden hover:ring-2 ring-primary transition ${hidden ? 'opacity-50' : ''} inline-block align-top"
               data-item-id="${esc(m._id || '')}" draggable="true">
            ${inner}
            ${orderBadge}
            ${dragHandle}
            ${videoBadge}
            <!-- Gizle/göster her zaman görünür -->
            <button type="button" class="media-toggle-hidden absolute top-1.5 right-1.5 size-7 rounded-md ${hideBtnColor} text-white text-sm flex items-center justify-center hover:opacity-90 z-10 shadow-md" title="${hideTitle}">
              <i class="ki-filled ${hideIcon}"></i>
            </button>
            <!-- Detay + Sil hover'da -->
            <div class="absolute top-1.5 right-10 flex gap-1 opacity-0 group-hover:opacity-100 transition z-10">
              <button type="button" class="media-open size-7 rounded-md bg-black/70 text-white text-sm flex items-center justify-center hover:bg-black/90" title="Detay">
                <i class="ki-filled ki-pencil"></i>
              </button>
              <button type="button" class="media-del size-7 rounded-md bg-destructive text-white text-sm flex items-center justify-center hover:opacity-90" title="Sil">×</button>
            </div>
          </div>
        `;
      })
      .join('');

    // detay aç (pencil butonu veya kartın görsel alanına çift-tık)
    galleryGrid.querySelectorAll('.media-open').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.media-card');
        if (card?.dataset.itemId) openLightbox(card.dataset.itemId);
      });
    });
    // Çift tık — event delegation (video üzerinde de çalışsın)
    if (!galleryGrid.__dblClickBound) {
      galleryGrid.addEventListener('dblclick', (e) => {
        if (e.target.closest('button')) return;
        const card = e.target.closest('.media-card');
        if (card?.dataset.itemId) openLightbox(card.dataset.itemId);
      });
      galleryGrid.__dblClickBound = true;
    }

    // gizle / görünür yap toggle
    galleryGrid.querySelectorAll('.media-toggle-hidden').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = btn.closest('.media-card');
        const itemId = card?.dataset.itemId;
        if (!itemId) return;
        const ch = currentChapter();
        const item = chapterMediaItems(ch).find((m) => m._id === itemId);
        if (!item) return;
        const newHidden = !item.hidden;
        try {
          const res = await window.panelApi.patch(
            `/panel/api/stories/${STORY_ID}/chapters/${state.selectedChapter}/media/${itemId}`,
            { hidden: newHidden },
          );
          ch.mediaItems = res.mediaItems || chapterMediaItems(ch);
          if (ch.scenes && ch.scenes[0]) ch.scenes[0].mediaItems = ch.mediaItems;
          renderGrid();
          window.panelToast?.success(newHidden ? 'Gizlendi' : 'Görünür yapıldı');
        } catch (err) {
          console.error(err);
          window.panelToast?.error('Değiştirilemedi');
        }
      });
    });

    // delete
    galleryGrid.querySelectorAll('.media-del').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = btn.closest('.media-card');
        const itemId = card?.dataset.itemId;
        if (!itemId || !confirm('Bu medya silinsin mi?')) return;
        try {
          await window.panelApi.delete(
            `/panel/api/stories/${STORY_ID}/chapters/${state.selectedChapter}/media/${itemId}`,
          );
          const ch = currentChapter();
          ch.mediaItems = chapterMediaItems(ch).filter((m) => m._id !== itemId);
          if (ch.scenes && ch.scenes[0] && Array.isArray(ch.scenes[0].mediaItems)) {
            ch.scenes[0].mediaItems = ch.scenes[0].mediaItems.filter((m) => m._id !== itemId);
          }
          renderChapterList();
          renderGrid();
          window.panelToast?.success('Silindi');
        } catch (err) {
          console.error(err);
          window.panelToast?.error('Silinemedi');
        }
      });
    });

    // drag reorder (within current tab scope)
    let draggedId = null;
    galleryGrid.querySelectorAll('.media-card').forEach((el) => {
      el.addEventListener('dragstart', () => {
        draggedId = el.dataset.itemId;
        el.classList.add('opacity-50');
      });
      el.addEventListener('dragend', () => el.classList.remove('opacity-50'));
      el.addEventListener('dragover', (e) => e.preventDefault());
      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        const targetId = el.dataset.itemId;
        if (!draggedId || draggedId === targetId) return;
        const ch = currentChapter();
        const arr = chapterMediaItems(ch).slice();
        const fromIdx = arr.findIndex((m) => m._id === draggedId);
        const toIdx = arr.findIndex((m) => m._id === targetId);
        if (fromIdx < 0 || toIdx < 0) return;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        arr.forEach((m, i) => (m.order = i));
        ch.mediaItems = arr;
        if (ch.scenes && ch.scenes[0]) ch.scenes[0].mediaItems = arr;
        renderGrid();
        try {
          await window.panelApi.put(
            `/panel/api/stories/${STORY_ID}/chapters/${state.selectedChapter}/media/order`,
            { orderedItemIds: arr.map((m) => m._id) },
          );
        } catch (err) {
          console.error(err);
          window.panelToast?.error('Sıralama kaydedilemedi');
        }
      });
    });
  }

  // ===== MEDIA TAB SWITCH =====
  document.querySelectorAll('.media-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.mediaTab;
      state.mediaTab = tab;
      document.querySelectorAll('.media-tab').forEach((b) => {
        b.classList.toggle('kt-btn-primary', b.dataset.mediaTab === tab);
        b.classList.toggle('kt-btn-outline', b.dataset.mediaTab !== tab);
      });
      updateUrlParams();
      renderGrid();
    });
  });

  // ===== UPLOAD =====
  galleryDrop?.addEventListener('click', (e) => {
    if (!e.target.closest('button')) galleryInput?.click();
  });
  galleryDrop?.addEventListener('dragover', (e) => {
    e.preventDefault();
    galleryDrop.classList.add('bg-muted/30');
  });
  galleryDrop?.addEventListener('dragleave', () => galleryDrop.classList.remove('bg-muted/30'));
  galleryDrop?.addEventListener('drop', (e) => {
    e.preventDefault();
    galleryDrop.classList.remove('bg-muted/30');
    handleUpload(Array.from(e.dataTransfer.files));
  });
  galleryInput?.addEventListener('change', (e) => handleUpload(Array.from(e.target.files)));

  async function extractVideoThumbnail(file) {
    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        video.addEventListener('loadeddata', resolve, { once: true });
        video.addEventListener('error', reject, { once: true });
        setTimeout(() => reject(new Error('timeout')), 5000);
      });
      await new Promise((r) => {
        video.currentTime = Math.min(1, video.duration || 0);
        video.addEventListener('seeked', r, { once: true });
      });
      const canvas = document.createElement('canvas');
      const maxDim = 512;
      const ratio = Math.min(maxDim / video.videoWidth, maxDim / video.videoHeight, 1);
      canvas.width = (video.videoWidth || 512) * ratio;
      canvas.height = (video.videoHeight || 512) * ratio;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/webp', 0.85));
    } catch (err) {
      console.warn('thumbnail extract failed', err);
      return null;
    }
  }

  async function uploadChapterFile(file, chapterIdx) {
    const isVideo = file.type.startsWith('video/');
    const kind = isVideo ? 'video' : 'image';

    let uploadBlob = file;
    let contentType = file.type;
    let thumbnailUrl;

    if (!isVideo) {
      // resize images to webp
      uploadBlob = await resizeToWebP(file, 1920);
      contentType = 'image/webp';
    }

    // presign + PUT main
    const presign = await window.panelApi.post(
      `/panel/api/stories/${STORY_ID}/chapters/${chapterIdx}/presign`,
      { contentType, kind },
    );
    await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: uploadBlob,
    });

    // thumbnail
    if (isVideo) {
      const thumbBlob = await extractVideoThumbnail(file);
      if (thumbBlob) {
        const thumbPresign = await window.panelApi.post(
          `/panel/api/stories/${STORY_ID}/chapters/${chapterIdx}/presign`,
          { contentType: 'image/webp', kind: 'image' },
        );
        await fetch(thumbPresign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/webp' },
          body: thumbBlob,
        });
        thumbnailUrl = thumbPresign.publicUrl;
      }
    } else {
      const thumbBlob = await resizeToWebP(file, 512);
      const thumbPresign = await window.panelApi.post(
        `/panel/api/stories/${STORY_ID}/chapters/${chapterIdx}/presign`,
        { contentType: 'image/webp', kind: 'image' },
      );
      await fetch(thumbPresign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/webp' },
        body: thumbBlob,
      });
      thumbnailUrl = thumbPresign.publicUrl;
    }

    return {
      url: presign.publicUrl,
      thumbnail: thumbnailUrl,
      mimeType: presign.mimeType,
      isVideo,
      originalName: file.name,
    };
  }

  async function handleUpload(files) {
    if (!STORY_ID) {
      window.panelToast?.error('Önce hikayeyi kaydet');
      return;
    }
    const ch = currentChapter();
    if (!ch) {
      window.panelToast?.error('Önce bir bölüm seçin');
      return;
    }
    const chapterIdx = state.selectedChapter;

    // Filter by current tab
    const expectVideo = state.mediaTab === 'videos';
    const valid = files.filter((f) => {
      const isVid = f.type.startsWith('video/');
      return expectVideo ? isVid : !isVid;
    });
    if (valid.length === 0) {
      window.panelToast?.error(`${expectVideo ? 'Video' : 'Görsel'} seçin`);
      return;
    }

    let okCount = 0;
    for (const file of valid) {
      try {
        const up = await uploadChapterFile(file, chapterIdx);
        const body = {
          url: up.url,
          thumbnail: up.thumbnail,
          mimeType: up.mimeType,
          title: up.isVideo ? 'legacy_video' : undefined,
          alt: up.originalName || undefined,
          hidden: false,
        };
        const res = await window.panelApi.post(
          `/panel/api/stories/${STORY_ID}/chapters/${chapterIdx}/media`,
          body,
        );
        // Sync local state with server response
        ch.mediaItems = res.mediaItems || chapterMediaItems(ch);
        if (ch.scenes && ch.scenes[0]) ch.scenes[0].mediaItems = ch.mediaItems;
        okCount++;
        renderChapterList();
        renderGrid();
      } catch (err) {
        console.error(err);
        window.panelToast?.error(`"${file.name}" yüklenemedi`);
      }
    }
    if (okCount > 0) {
      window.panelToast?.success(`${okCount} dosya yüklendi`);
    }
  }

  // ===== LIGHTBOX MODAL =====
  const modal = document.getElementById('media-modal');
  // Modal'ı body'e taşı — transform'lu parent'lar position:fixed'i bozar
  if (modal && modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }
  // Inline style ile kesin fixed konumlama (CSS purge güvenli)
  if (modal) {
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.zIndex = '9999';
  }
  const modalPreview = document.getElementById('media-modal-preview');
  const modalUrl = document.getElementById('media-modal-url');
  const modalTitleInput = document.getElementById('media-modal-title-input');
  const modalAlt = document.getElementById('media-modal-alt');
  const modalOrder = document.getElementById('media-modal-order');
  const modalHidden = document.getElementById('media-modal-hidden');

  let activeItemId = null;

  function openLightbox(itemId) {
    const ch = currentChapter();
    if (!ch || !itemId) return;
    const item = chapterMediaItems(ch).find((m) => m._id === itemId);
    if (!item) return;
    activeItemId = itemId;

    const isVid = isVideoItem(item);
    modalPreview.innerHTML = isVid
      ? `<video src="${esc(item.url)}" controls style="max-height:600px;width:auto;max-width:100%;" class="rounded bg-black"></video>`
      : `<img src="${esc(item.url)}" alt="" style="max-height:600px;width:auto;max-width:100%;" class="object-contain rounded"/>`;
    modalUrl.value = item.url || '';
    modalTitleInput.value = item.title || '';
    modalAlt.value = item.alt || '';
    modalOrder.value = item.order ?? 0;
    modalHidden.checked = !!item.hidden;
    modal.classList.remove('hidden');
  }

  function closeLightbox() {
    modal.classList.add('hidden');
    modalPreview.innerHTML = '';
    activeItemId = null;
  }

  document.getElementById('media-modal-close')?.addEventListener('click', closeLightbox);
  document.getElementById('media-modal-cancel')?.addEventListener('click', closeLightbox);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeLightbox();
  });

  document.getElementById('media-modal-save')?.addEventListener('click', async () => {
    if (!activeItemId) return;
    const patch = {
      title: modalTitleInput.value.trim() || undefined,
      alt: modalAlt.value.trim() || undefined,
      order: parseInt(modalOrder.value, 10) || 0,
      hidden: !!modalHidden.checked,
    };
    try {
      const res = await window.panelApi.patch(
        `/panel/api/stories/${STORY_ID}/chapters/${state.selectedChapter}/media/${activeItemId}`,
        patch,
      );
      const ch = currentChapter();
      ch.mediaItems = res.mediaItems || chapterMediaItems(ch);
      if (ch.scenes && ch.scenes[0]) ch.scenes[0].mediaItems = ch.mediaItems;
      window.panelToast?.success('Kaydedildi');
      closeLightbox();
      renderChapterList();
      renderGrid();
    } catch (err) {
      console.error(err);
      window.panelToast?.error('Kaydedilemedi');
    }
  });

  document.getElementById('media-modal-delete')?.addEventListener('click', async () => {
    if (!activeItemId || !confirm('Bu medya silinsin mi?')) return;
    try {
      await window.panelApi.delete(
        `/panel/api/stories/${STORY_ID}/chapters/${state.selectedChapter}/media/${activeItemId}`,
      );
      const ch = currentChapter();
      ch.mediaItems = chapterMediaItems(ch).filter((m) => m._id !== activeItemId);
      if (ch.scenes && ch.scenes[0] && Array.isArray(ch.scenes[0].mediaItems)) {
        ch.scenes[0].mediaItems = ch.scenes[0].mediaItems.filter((m) => m._id !== activeItemId);
      }
      window.panelToast?.success('Silindi');
      closeLightbox();
      renderChapterList();
      renderGrid();
    } catch (err) {
      console.error(err);
      window.panelToast?.error('Silinemedi');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeLightbox();
  });

  // ===== INIT =====
  readInitialParams();

  // Wait for __story to populate via stories-edit.js fetch
  let tries = 0;
  const pollStory = setInterval(() => {
    tries++;
    if (window.__story?.chapters) {
      clearInterval(pollStory);
      renderChapterList();
      renderGrid();
      updateUrlParams();
    } else if (tries > 30) {
      clearInterval(pollStory);
      renderChapterList();
      renderGrid();
    }
  }, 100);
})();
