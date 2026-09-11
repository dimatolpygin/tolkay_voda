// Баннеры партнёров под плеером (этап 16). Два фиксированных слота, без ротации.
// Пустой слот не рисуется; оба пустых — блок остаётся скрытым и вёрстку не трогает.
// Управление слотами появится в панели на этапе 17, здесь только показ.
// Имена классов, id и адрес запроса без слов ad/ads — иначе блок режет блокировщик.
(() => {
  const section = document.getElementById('partners');
  if (!section) return;
  // Главную отдаёт сервер с уже готовыми карточками (src/routes/home.js) —
  // там дорисовывать нечего. Клиентский рендер остаётся для страниц-фолбэков.
  if (section.dataset.ssr === '1') return;
  const grid = document.getElementById('partnersGrid');

  function card(item) {
    const a = document.createElement('a');
    a.className = 'partner card';
    a.href = item.linkUrl;
    a.target = '_blank';
    // nofollow sponsored — платные ссылки не должны утягивать вниз SEO с этапа 12.
    a.rel = 'noopener noreferrer nofollow sponsored';

    const img = document.createElement('img');
    img.className = 'partner__img';
    img.src = item.imageUrl;
    // Подпись кнопки уже даёт ссылке доступное имя — не дублируем его в alt.
    img.alt = item.buttonText ? '' : 'Баннер партнёра';
    img.loading = 'lazy';
    img.decoding = 'async';
    a.append(img);

    if (item.buttonText) {
      const cta = document.createElement('span');
      cta.className = 'partner__cta';
      cta.textContent = item.buttonText;
      a.append(cta);
    }
    return a;
  }

  fetch('/api/partners')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const items = (data && data.ok && Array.isArray(data.partners)) ? data.partners : [];
      if (!items.length) return; // оба слота пусты — блок не показываем
      grid.replaceChildren(...items.map(card));
      grid.classList.toggle('partners__grid--one', items.length === 1);
      section.hidden = false;
    })
    .catch(() => {
      // Баннер не критичен: при сбое запроса блока просто не будет.
    });
})();
