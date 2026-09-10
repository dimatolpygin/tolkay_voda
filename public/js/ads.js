// Рекламные баннеры под плеером (этап 16). Два фиксированных слота, без ротации.
// Пустой слот не рисуется; оба пустых — блок остаётся скрытым и вёрстку не трогает.
// Управление слотами появится в панели на этапе 17, здесь только показ.
(() => {
  const section = document.getElementById('ads');
  if (!section) return;
  const grid = document.getElementById('adsGrid');

  function card(ad) {
    const a = document.createElement('a');
    a.className = 'ad card';
    a.href = ad.linkUrl;
    a.target = '_blank';
    // nofollow sponsored — платные ссылки не должны утягивать вниз SEO с этапа 12.
    a.rel = 'noopener noreferrer nofollow sponsored';

    const img = document.createElement('img');
    img.className = 'ad__img';
    img.src = ad.imageUrl;
    // Подпись кнопки уже даёт ссылке доступное имя — не дублируем его в alt.
    img.alt = ad.buttonText ? '' : 'Баннер партнёра';
    img.loading = 'lazy';
    img.decoding = 'async';
    a.append(img);

    if (ad.buttonText) {
      const cta = document.createElement('span');
      cta.className = 'ad__cta';
      cta.textContent = ad.buttonText;
      a.append(cta);
    }
    return a;
  }

  fetch('/api/ads')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const ads = (data && data.ok && Array.isArray(data.ads)) ? data.ads : [];
      if (!ads.length) return; // оба слота пусты — блок не показываем
      grid.replaceChildren(...ads.map(card));
      grid.classList.toggle('ads__grid--one', ads.length === 1);
      section.hidden = false;
    })
    .catch(() => {
      // Реклама не критична: при сбое запроса блока просто не будет.
    });
})();
