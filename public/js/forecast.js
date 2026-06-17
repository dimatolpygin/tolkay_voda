// Прогноз дня: грузит актуальную запись, рисует блок на главной по макету
// (лунный день, вводка, строки Вода/Цвет/Еда/Совет дня), по кнопке открывает
// модалку с полным текстом, разбитым на секции (## заголовки).
(() => {
  const section = document.getElementById('forecast');
  if (!section) return;

  const elTitle = document.getElementById('fcTitle');
  const elDate = document.getElementById('fcDate');
  const elSubtitle = document.getElementById('fcSubtitle');
  const elIntro = document.getElementById('fcIntro');
  const elMeta = document.getElementById('fcMeta');
  const elImage = document.getElementById('fcImage');
  const elMedia = section.querySelector('.forecast__media');
  const btnMore = document.getElementById('fcMore');

  const modal = document.getElementById('fcModal');
  const modalTitle = document.getElementById('fcModalTitle');
  const modalHeading = document.getElementById('fcModalHeading');
  const modalDate = document.getElementById('fcModalDate');
  const modalBody = document.getElementById('fcModalBody');

  const MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  const WEEKDAYS = [
    'воскресенье', 'понедельник', 'вторник', 'среда',
    'четверг', 'пятница', 'суббота',
  ];

  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return iso || '';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS[d.getDay()]}`;
  }

  // Строка вида «Вода дня: текст» с выделенным ключом.
  function metaRow(label, value) {
    if (!value) return null;
    const p = document.createElement('p');
    p.className = 'forecast__row';
    const key = document.createElement('span');
    key.className = 'forecast__key';
    key.textContent = `${label}: `;
    p.append(key, document.createTextNode(value));
    return p;
  }

  let current = null;

  function render(f) {
    current = f;

    elTitle.textContent = f.title || 'Прогноз от Геннадия Серафимовича';
    elDate.textContent = formatDate(f.date);

    elSubtitle.textContent = f.subtitle || '';
    elSubtitle.hidden = !f.subtitle;

    const intro = f.intro || f.summary || '';
    elIntro.textContent = intro;
    elIntro.hidden = !intro;

    elMeta.replaceChildren();
    for (const [label, value] of [
      ['Вода дня', f.water],
      ['Цвет дня', f.color],
      ['Еда дня', f.food],
      ['Совет дня', f.advice],
    ]) {
      const row = metaRow(label, value);
      if (row) elMeta.append(row);
    }

    if (f.image_url) {
      elImage.src = f.image_url;
      elImage.alt = f.title || 'Прогноз дня';
      if (elMedia) elMedia.hidden = false;
      // Недоступное фото (демо-данные) не должно ломать вёрстку.
      elImage.onerror = () => { if (elMedia) elMedia.hidden = true; };
    } else if (elMedia) {
      elMedia.hidden = true;
    }

    const hasFull = f.body && f.body.trim();
    btnMore.hidden = !hasFull;

    section.hidden = false;
  }

  // Рендер полного текста: строки «## Заголовок» → подзаголовки, остальное — абзацы.
  function renderFull(container, text) {
    container.replaceChildren();
    const blocks = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      const head = /^##\s+(.*)$/m;
      // Разбиваем блок построчно: заголовки и текст могут идти подряд.
      const lines = trimmed.split('\n');
      let buf = [];
      const flush = () => {
        if (!buf.length) return;
        const p = document.createElement('p');
        p.className = 'modal__p';
        p.textContent = buf.join('\n');
        container.append(p);
        buf = [];
      };
      for (const line of lines) {
        const hm = head.exec(line);
        if (hm) {
          flush();
          const h = document.createElement('h3');
          h.className = 'modal__h';
          h.textContent = hm[1].trim();
          container.append(h);
        } else {
          buf.push(line);
        }
      }
      flush();
    }
  }

  // ---- Модалка ----
  let lastFocus = null;

  function openModal() {
    if (!current) return;
    lastFocus = document.activeElement;
    modalTitle.textContent = 'Прогноз дня';
    modalHeading.textContent = current.title || '';
    modalHeading.hidden = !current.title;
    modalDate.textContent =
      [formatDate(current.date), current.subtitle].filter(Boolean).join(' · ');
    renderFull(modalBody, current.body || current.intro || '');
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    modal.querySelector('.modal__close')?.focus();
  }

  function closeModal() {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  btnMore?.addEventListener('click', openModal);
  modal?.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.hasAttribute('data-close')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  async function load() {
    try {
      const r = await fetch('/api/forecast/today');
      const data = await r.json();
      if (data && data.ok && data.forecast) render(data.forecast);
    } catch {
      // молча: блок скрыт, если прогноза нет
    }
  }

  load();
})();
