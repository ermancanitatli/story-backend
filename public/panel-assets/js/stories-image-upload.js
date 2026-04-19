(function() {
  const STORY_ID = window.location.pathname.match(/\/panel\/stories\/([^\/]+)\/edit/)?.[1];

  async function resizeToWebP(file, maxDim) {
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
    canvas.width = img.width * ratio;
    canvas.height = img.height * ratio;
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/webp', 0.9));
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function uploadFile(file, kind = 'gallery') {
    if (!STORY_ID) {
      window.panelToast?.error('Önce hikayeyi kaydet');
      return null;
    }
    const contentType = 'image/webp';
    const webpBlob = await resizeToWebP(file, 1920);
    const thumbBlob = await resizeToWebP(file, 512);

    const presign = await window.panelApi.post(`/panel/api/stories/${STORY_ID}/images/presign`, {
      contentType, kind,
    });
    await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: webpBlob });

    // Thumb presign ayrı
    const thumbPresign = await window.panelApi.post(`/panel/api/stories/${STORY_ID}/images/presign`, {
      contentType, kind,
    });
    await fetch(thumbPresign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: thumbBlob });

    return { url: presign.publicUrl, thumbnail: thumbPresign.publicUrl, imageId: presign.imageId };
  }

  // COVER
  const dropzone = document.getElementById('cover-dropzone');
  const input = document.getElementById('cover-input');
  const preview = document.getElementById('cover-preview');
  const placeholder = document.getElementById('cover-placeholder');
  const img = document.getElementById('cover-img');

  function showCover(url) {
    img.src = url;
    preview?.classList.remove('hidden');
    placeholder?.classList.add('hidden');
  }

  dropzone?.addEventListener('click', e => { if (!e.target.closest('button')) input?.click(); });
  dropzone?.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('bg-muted/30'); });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('bg-muted/30'));
  dropzone?.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('bg-muted/30');
    if (e.dataTransfer.files[0]) handleCover(e.dataTransfer.files[0]);
  });
  input?.addEventListener('change', e => { if (e.target.files[0]) handleCover(e.target.files[0]); });

  async function handleCover(file) {
    const progress = document.getElementById('cover-progress');
    progress?.classList.remove('hidden');
    try {
      const uploaded = await uploadFile(file, 'cover');
      if (!uploaded) return;
      showCover(uploaded.url);
      if (!window.__story) window.__story = {};
      window.__story.coverImage = [{ _id: uploaded.imageId, url: uploaded.url, thumbnail: uploaded.thumbnail, order: 0 }];
      window.panelToast?.success('Kapak yüklendi');
    } catch (err) {
      window.panelToast?.error('Yükleme başarısız');
    } finally {
      progress?.classList.add('hidden');
    }
  }

  document.getElementById('cover-replace')?.addEventListener('click', () => input?.click());
  document.getElementById('cover-remove')?.addEventListener('click', () => {
    if (!confirm('Kapak kaldırılsın mı?')) return;
    if (window.__story) window.__story.coverImage = [];
    preview?.classList.add('hidden');
    placeholder?.classList.remove('hidden');
  });

  // Initial load
  setTimeout(() => {
    const url = window.__story?.coverImage?.[0]?.url;
    if (url) showCover(url);
  }, 700);

  // GALLERY
  const galleryDrop = document.getElementById('gallery-dropzone');
  const galleryInput = document.getElementById('gallery-input');
  const galleryGrid = document.getElementById('gallery-grid');

  function renderGallery() {
    if (!galleryGrid || !window.__story) return;
    const items = window.__story.galleryImages || [];
    galleryGrid.innerHTML = items.map((img, i) => `
      <div class="gallery-item relative border border-border rounded overflow-hidden" draggable="true" data-index="${i}">
        <img src="${img.thumbnail || img.url}" class="w-full h-32 object-cover"/>
        <input type="text" class="kt-input text-xs rounded-none border-x-0 border-b-0" placeholder="alt" value="${(img.alt || '').replace(/"/g,'&quot;')}" data-alt-index="${i}"/>
        <button type="button" class="absolute top-1 right-1 size-6 rounded-full bg-destructive text-white text-xs gallery-del" data-index="${i}">×</button>
      </div>
    `).join('');

    // alt inputs
    galleryGrid.querySelectorAll('[data-alt-index]').forEach(inp => {
      inp.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.altIndex, 10);
        window.__story.galleryImages[i].alt = e.target.value;
      });
    });

    // delete
    galleryGrid.querySelectorAll('.gallery-del').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Silinsin mi?')) return;
        const i = parseInt(btn.dataset.index, 10);
        window.__story.galleryImages.splice(i, 1);
        renderGallery();
      });
    });

    // drag-drop reorder (HTML5 native)
    let draggedIndex = null;
    galleryGrid.querySelectorAll('.gallery-item').forEach(el => {
      el.addEventListener('dragstart', e => { draggedIndex = parseInt(el.dataset.index, 10); el.classList.add('opacity-50'); });
      el.addEventListener('dragend', () => el.classList.remove('opacity-50'));
      el.addEventListener('dragover', e => e.preventDefault());
      el.addEventListener('drop', e => {
        e.preventDefault();
        const targetIndex = parseInt(el.dataset.index, 10);
        if (draggedIndex === null || draggedIndex === targetIndex) return;
        const arr = window.__story.galleryImages;
        const [moved] = arr.splice(draggedIndex, 1);
        arr.splice(targetIndex, 0, moved);
        renderGallery();
      });
    });
  }

  galleryDrop?.addEventListener('click', e => { if (!e.target.closest('button')) galleryInput?.click(); });
  galleryDrop?.addEventListener('dragover', e => { e.preventDefault(); galleryDrop.classList.add('bg-muted/30'); });
  galleryDrop?.addEventListener('dragleave', () => galleryDrop.classList.remove('bg-muted/30'));
  galleryDrop?.addEventListener('drop', e => {
    e.preventDefault();
    galleryDrop.classList.remove('bg-muted/30');
    handleGalleryFiles(Array.from(e.dataTransfer.files));
  });
  galleryInput?.addEventListener('change', e => handleGalleryFiles(Array.from(e.target.files)));

  async function handleGalleryFiles(files) {
    if (!window.__story) window.__story = {};
    window.__story.galleryImages = window.__story.galleryImages || [];
    // concurrency 3
    const chunks = [];
    for (let i = 0; i < files.length; i += 3) chunks.push(files.slice(i, i + 3));
    for (const chunk of chunks) {
      const uploaded = await Promise.all(chunk.map(f => uploadFile(f, 'gallery')));
      uploaded.forEach(u => {
        if (u) window.__story.galleryImages.push({
          _id: u.imageId, url: u.url, thumbnail: u.thumbnail, order: window.__story.galleryImages.length, alt: '',
        });
      });
      renderGallery();
    }
    window.panelToast?.success(`${files.length} görsel yüklendi`);
  }

  setTimeout(() => { if (window.__story) renderGallery(); }, 700);
  setTimeout(() => { if (window.__story) renderGallery(); }, 1500);
})();
