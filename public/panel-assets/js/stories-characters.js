(function () {
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
    );

  function renderCharacters() {
    const container = document.getElementById('characters-list');
    const empty = document.getElementById('characters-empty');
    if (!container || !window.__story) return;

    if (!Array.isArray(window.__story.characters)) {
      window.__story.characters = [];
    }
    const list = window.__story.characters;

    // Önceki kartları temizle
    container.querySelectorAll('.character-card').forEach((el) => el.remove());

    if (list.length === 0) {
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');

    list.forEach((ch, ci) => {
      const card = document.createElement('div');
      card.className = 'character-card kt-card';
      card.dataset.index = ci;
      const hasAvatar = !!ch.avatarUrl;
      card.innerHTML = `
        <div class="kt-card-content p-4">
          <div class="flex items-start gap-4 flex-wrap">
            <!-- AVATAR -->
            <div class="flex flex-col items-center gap-2 shrink-0">
              <div class="avatar-wrap relative" style="width:96px;height:96px;">
                ${hasAvatar
                  ? `<img src="${esc(ch.avatarUrl)}" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:8px;" class="border border-border"/>`
                  : `<div style="width:96px;height:96px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:32px;background:rgba(0,0,0,0.08);color:rgba(0,0,0,0.5);" class="border border-border">👤</div>`
                }
              </div>
              <div class="flex gap-1">
                <button type="button" class="kt-btn kt-btn-xs kt-btn-outline char-avatar-upload">Avatar</button>
                ${hasAvatar ? '<button type="button" class="kt-btn kt-btn-xs kt-btn-ghost char-avatar-remove">Sil</button>' : ''}
              </div>
              <input type="file" class="char-avatar-input hidden" accept="image/jpeg,image/png,image/webp"/>
            </div>

            <!-- FIELDS -->
            <div class="flex-1 min-w-[280px] grid gap-3">
              <div class="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                <label class="kt-form-label max-w-32">İsim</label>
                <input class="kt-input char-name" value="${esc(ch.name || '')}" placeholder="Karakter adı"/>
              </div>
              <div class="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                <label class="kt-form-label max-w-32">Cinsiyet</label>
                <select class="kt-input char-gender">
                  <option value="">—</option>
                  <option value="female" ${ch.gender === 'female' ? 'selected' : ''}>Kadın</option>
                  <option value="male" ${ch.gender === 'male' ? 'selected' : ''}>Erkek</option>
                  <option value="nonbinary" ${ch.gender === 'nonbinary' ? 'selected' : ''}>Non-binary</option>
                  <option value="other" ${ch.gender && !['female','male','nonbinary'].includes(ch.gender) ? 'selected' : ''}>Diğer</option>
                </select>
              </div>
              <div class="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                <label class="kt-form-label max-w-32">Rol</label>
                <select class="kt-input char-role">
                  <option value="">—</option>
                  <option value="main" ${ch.role === 'main' ? 'selected' : ''}>Ana Karakter</option>
                  <option value="protagonist" ${ch.role === 'protagonist' ? 'selected' : ''}>Protagonist</option>
                  <option value="antagonist" ${ch.role === 'antagonist' ? 'selected' : ''}>Antagonist</option>
                  <option value="supporter" ${ch.role === 'supporter' ? 'selected' : ''}>Yardımcı</option>
                  <option value="user" ${ch.role === 'user' ? 'selected' : ''}>Oyuncu (user)</option>
                </select>
              </div>
              <div class="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                <label class="kt-form-label max-w-32">Kişilik</label>
                <textarea class="kt-input char-personality" rows="2" placeholder="Kişilik özellikleri">${esc(ch.personality || '')}</textarea>
              </div>
              <div class="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                <label class="kt-form-label max-w-32">Açıklama</label>
                <textarea class="kt-input char-description" rows="3" placeholder="Fiziksel/hikaye açıklaması">${esc(ch.description || '')}</textarea>
              </div>
              <div class="flex justify-end">
                <button type="button" class="kt-btn kt-btn-sm kt-btn-destructive char-remove">Karakteri Sil</button>
              </div>
            </div>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    wireEvents();
  }

  function wireEvents() {
    document.querySelectorAll('.character-card').forEach((card) => {
      const ci = parseInt(card.dataset.index, 10);
      const bindField = (sel, key) => {
        const el = card.querySelector(sel);
        el?.addEventListener('input', (e) => {
          if (!window.__story?.characters?.[ci]) return;
          window.__story.characters[ci][key] = e.target.value;
        });
        el?.addEventListener('change', (e) => {
          if (!window.__story?.characters?.[ci]) return;
          window.__story.characters[ci][key] = e.target.value;
        });
      };
      bindField('.char-name', 'name');
      bindField('.char-gender', 'gender');
      bindField('.char-role', 'role');
      bindField('.char-personality', 'personality');
      bindField('.char-description', 'description');

      card.querySelector('.char-remove')?.addEventListener('click', () => {
        if (!confirm('Karakter silinsin mi?')) return;
        window.__story.characters.splice(ci, 1);
        renderCharacters();
      });

      // Avatar upload
      const avatarInput = card.querySelector('.char-avatar-input');
      const avatarBtn = card.querySelector('.char-avatar-upload');
      avatarBtn?.addEventListener('click', () => avatarInput?.click());
      avatarInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const STORY_ID = window.location.pathname.match(/\/panel\/stories\/([^\/]+)\/edit/)?.[1];
        if (!STORY_ID) {
          window.panelToast?.error('Önce hikayeyi kaydet');
          return;
        }
        try {
          // Basit resize: max 512
          const img = await new Promise((res, rej) => {
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = rej;
            im.src = URL.createObjectURL(file);
          });
          const canvas = document.createElement('canvas');
          const ratio = Math.min(512 / img.width, 512 / img.height, 1);
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((r) => canvas.toBlob((b) => r(b), 'image/webp', 0.9));

          const presign = await window.panelApi.post(
            `/panel/api/stories/${STORY_ID}/images/presign`,
            { contentType: 'image/webp', kind: 'character' },
          );
          await fetch(presign.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/webp' },
            body: blob,
          });
          window.__story.characters[ci].avatarUrl = presign.publicUrl;
          renderCharacters();
          window.panelToast?.success('Avatar yüklendi');
        } catch (err) {
          console.error(err);
          window.panelToast?.error('Avatar yüklenemedi');
        }
      });

      card.querySelector('.char-avatar-remove')?.addEventListener('click', () => {
        window.__story.characters[ci].avatarUrl = undefined;
        renderCharacters();
      });
    });
  }

  document.getElementById('btn-add-character')?.addEventListener('click', () => {
    if (!window.__story) window.__story = {};
    if (!Array.isArray(window.__story.characters)) window.__story.characters = [];
    window.__story.characters.push({
      name: '',
      gender: '',
      role: '',
      personality: '',
      description: '',
    });
    renderCharacters();
  });

  // __story yüklendiğinde render et
  let tries = 0;
  const pollStory = setInterval(() => {
    tries++;
    if (window.__story) {
      clearInterval(pollStory);
      renderCharacters();
    } else if (tries > 30) {
      clearInterval(pollStory);
    }
  }, 100);
})();
