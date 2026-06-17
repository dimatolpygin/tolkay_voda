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

  // Рендер тела статьи: «## Заголовок» → подзаголовки, остальное — абзацы.
  function renderBody(container, text) {
    container.replaceChildren();
    const blocks = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
    for (const block of blocks) {
      if (!block.trim()) continue;
      for (const line of block.split('\n')) {
        const hm = /^##\s+(.*)$/.exec(line);
        if (hm) {
          const h = document.createElement('h2');
          h.textContent = hm[1].trim();
          container.append(h);
        }
      }
      const para = block
        .split('\n')
        .filter((l) => !/^##\s+/.test(l))
        .join('\n')
        .trim();
      if (para) {
        const p = document.createElement('p');
        p.textContent = para;
        container.append(p);
      }
    }
  }

  function render(p) {
    pvDate.textContent = formatDate(p.created_at);
    pvTitle.textContent = p.title || '';
    if (p.image_url) {
      pvImage.src = p.image_url;
      pvImage.alt = p.title || '';
      pvImage.hidden = false;
      // Недоступное фото (демо-данные) не должно показывать broken-image.
      pvImage.onerror = () => { pvImage.hidden = true; };
    }
    renderBody(pvBody, p.body || '');
    document.title = `${p.title || 'Статья'} — Радио «Толкай Вода»`;
    view.hidden = false;
    state.hidden = true;
  }

  // slug из ЧПУ /blog/:slug либо из старой ссылки /post.html?slug=
  const pathSlug = (location.pathname.match(/^\/blog\/([^/?#]+)/) || [])[1];
  const slug = pathSlug ? decodeURIComponent(pathSlug) : new URLSearchParams(location.search).get('slug');
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
