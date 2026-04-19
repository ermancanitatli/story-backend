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
})();
