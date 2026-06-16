// Прогноз дня: грузит актуальную запись, рисует блок на главной,
// по кнопке открывает модалку с полным текстом.
(() => {
  const section = document.getElementById('forecast');
  if (!section) return;

  const elTitle = document.getElementById('fcTitle');
  const elDate = document.getElementById('fcDate');
  const elSummary = document.getElementById('fcSummary');
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

  // YYYY-MM-DD → «16 июня 2026, вторник»
  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return iso || '';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS[d.getDay()]}`;
  }

  let current = null;

  function render(f) {
    current = f;

    if (f.title) {
      elTitle.textContent = f.title;
      elTitle.hidden = false;
    } else {
      elTitle.hidden = true;
    }

    elDate.textContent = formatDate(f.date);
    elSummary.textContent = f.summary || f.body || '';

    if (f.image_url) {
      elImage.src = f.image_url;
      elImage.alt = f.title || 'Прогноз дня';
      if (elMedia) elMedia.hidden = false;
    } else if (elMedia) {
      elMedia.hidden = true;
    }

    // Кнопку «Читать полный прогноз» показываем только если полный текст
    // действительно богаче выжимки.
    const hasMore = f.body && f.body.trim() && f.body.trim() !== (f.summary || '').trim();
    btnMore.hidden = !hasMore;

    section.hidden = false;
  }

  // ---- Модалка ----
  let lastFocus = null;

  function openModal() {
    if (!current) return;
    lastFocus = document.activeElement;
    modalTitle.textContent = 'Прогноз дня';
    modalHeading.textContent = current.title || '';
    modalHeading.hidden = !current.title;
    modalDate.textContent = formatDate(current.date);
    modalBody.textContent = current.body || current.summary || '';
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

  // ---- Загрузка ----
  async function load() {
    try {
      const r = await fetch('/api/forecast/today');
      const data = await r.json();
      if (data && data.ok && data.forecast) render(data.forecast);
    } catch {
      // молча: блок остаётся скрытым, если прогноза нет или сеть упала
    }
  }

  load();
})();
