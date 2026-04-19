(function() {
  const headings = {}, contents = {};

  // Locale tab switch
  document.querySelectorAll('.locale-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const loc = btn.dataset.locale;
      document.querySelectorAll('.locale-tab').forEach(b => {
        b.classList.toggle('border-b-2', b.dataset.locale === loc);
        b.classList.toggle('border-primary', b.dataset.locale === loc);
        b.classList.toggle('text-primary', b.dataset.locale === loc);
        b.classList.toggle('text-muted-foreground', b.dataset.locale !== loc);
      });
      document.querySelectorAll('.locale-panel').forEach(p => {
        p.classList.toggle('hidden', p.dataset.locale !== loc);
      });
    });
  });

  // Input capture + preview update
  document.querySelectorAll('[data-heading]').forEach(inp => {
    inp.addEventListener('input', e => {
      const loc = e.target.dataset.heading;
      headings[loc] = e.target.value;
      if (loc === 'tr' || loc === 'en') updatePreview();
    });
  });
  document.querySelectorAll('[data-content]').forEach(inp => {
    inp.addEventListener('input', e => {
      const loc = e.target.dataset.content;
      contents[loc] = e.target.value;
      if (loc === 'tr' || loc === 'en') updatePreview();
    });
  });

  function updatePreview() {
    document.getElementById('preview-title').textContent = headings.tr || headings.en || 'Bildirim Başlığı';
    document.getElementById('preview-body').textContent = contents.tr || contents.en || 'Bildirim içeriği burada';
    const img = document.getElementById('image-input').value;
    const imgEl = document.getElementById('preview-image');
    if (img) {
      imgEl.classList.remove('hidden');
      imgEl.querySelector('img').src = img;
    } else {
      imgEl.classList.add('hidden');
    }
  }
  document.getElementById('image-input').addEventListener('input', updatePreview);

  // Segment change
  const segSel = document.getElementById('segment-select');
  const customWrap = document.getElementById('custom-ids-wrapper');
  segSel.addEventListener('change', () => {
    customWrap.classList.toggle('hidden', segSel.value !== 'custom_user_ids');
    estimate();
  });

  // Estimate
  let estTimer;
  function estimate() {
    clearTimeout(estTimer);
    estTimer = setTimeout(async () => {
      const payload = { segment: segSel.value };
      if (segSel.value === 'custom_user_ids') {
        const ids = document.getElementById('custom-ids').value.split(/[\s,]+/).filter(Boolean);
        payload.customUserIds = ids;
      }
      try {
        const res = await window.panelApi.post('/panel/api/notifications/estimate', payload);
        document.getElementById('estimate-count').textContent = res.count.toLocaleString('tr-TR');
      } catch { document.getElementById('estimate-count').textContent = '?'; }
    }, 400);
  }
  document.getElementById('custom-ids').addEventListener('input', estimate);
  estimate();

  // Send
  document.getElementById('send-btn').addEventListener('click', async () => {
    if (!headings.en || !contents.en) {
      window.panelToast?.error('EN başlık ve içerik zorunlu');
      return;
    }
    const count = document.getElementById('estimate-count').textContent;
    if (!confirm(`${count} kullanıcıya gönderilecek. Devam?`)) return;

    const btn = document.getElementById('send-btn');
    btn.disabled = true;
    btn.textContent = 'Gönderiliyor...';

    const payload = {
      headings, contents, segment: segSel.value,
      url: document.getElementById('url-input').value || undefined,
      bigPicture: document.getElementById('image-input').value || undefined,
    };
    if (segSel.value === 'custom_user_ids') {
      payload.customUserIds = document.getElementById('custom-ids').value.split(/[\s,]+/).filter(Boolean);
    }
    try {
      const res = await window.panelApi.post('/panel/api/notifications/send', payload);
      window.panelToast?.success(`Gönderildi (${res.estimatedRecipients} alıcı)`);
    } catch (e) {
      window.panelToast?.error(e.message || 'Gönderim başarısız');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Gönder';
    }
  });
})();
