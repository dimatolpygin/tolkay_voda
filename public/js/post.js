// Страница статьи: грузит /api/posts/:slug по ?slug= и рендерит.
(() => {
  const view = document.getElementById('postView');
  const state = document.getElementById('postState');
  const psText = document.getElementById('psText');
  const pvDate = document.getElementById('pvDate');
  const pvTitle = document.getElementById('pvTitle');
  const pvImage = document.getElementById('pvImage');
  const pvBody = document.getElementById('pvBody');
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  function formatDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    if (!m) return '';
    return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  }

  function showState(text) {
    psText.textContent = text;
    state.hidden = false;
    view.hidden = true;
  }

  function render(p) {
    pvDate.textContent = formatDate(p.created_at);
    pvTitle.textContent = p.title || '';
    if (p.image_url) {
      pvImage.src = p.image_url;
      pvImage.alt = p.title || '';
      pvImage.hidden = false;
    }
    pvBody.textContent = p.body || '';
    document.title = `${p.title || 'Статья'} — Радио «Толкай Вода»`;
    view.hidden = false;
    state.hidden = true;
  }

  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) {
    showState('Статья не указана.');
    return;
  }

  fetch(`/api/posts/${encodeURIComponent(slug)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => {
      if (data && data.ok && data.post) render(data.post);
      else showState('Статья не найдена.');
    })
    .catch((status) => {
      showState(status === 404 ? 'Статья не найдена.' : 'Не удалось загрузить статью.');
    });
})();
