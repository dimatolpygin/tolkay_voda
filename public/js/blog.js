// Блог: горизонтальная лента статей со скроллом вправо.
// Данные из /api/posts (одной лентой). Клик по карточке → /blog/:slug (ЧПУ)...
(() => {
  const section = document.getElementById('blog');
  if (!section) return;

  const rail = document.getElementById('blogRail');
  const prev = document.getElementById('blogPrev');
  const next = document.getElementById('blogNext');

  const MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  function formatDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    if (!m) return '';
    return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  }

  function card(p) {
    const a = document.createElement('a');
    a.className = 'post';
    a.href = `/blog/${encodeURIComponent(p.slug)}`;

    const img = document.createElement('img');
    img.className = 'post__img';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = p.title || '';
    img.src = p.image_url || '/assets/img/cover-default.webp';
    // Если фото с CDN недоступно (демо-данные / удалённое фото) — плейсхолдер.
    img.addEventListener('error', () => {
      if (img.src.endsWith('/assets/img/cover-default.webp')) return;
      img.src = '/assets/img/cover-default.webp';
    });

    const body = document.createElement('div');
    body.className = 'post__body';

    const h = document.createElement('h3');
    h.className = 'post__title';
    h.textContent = p.title || '';

    const ex = document.createElement('p');
    ex.className = 'post__excerpt';
    ex.textContent = p.excerpt || '';

    const date = document.createElement('p');
    date.className = 'post__date';
    date.textContent = formatDate(p.created_at);

    body.append(h, ex, date);
    a.append(img, body);
    return a;
  }

  // Показ/скрытие стрелок в зависимости от позиции скролла.
  function updateNav() {
    const max = rail.scrollWidth - rail.clientWidth;
    const overflow = max > 4;
    prev.hidden = !overflow || rail.scrollLeft <= 2;
    next.hidden = !overflow || rail.scrollLeft >= max - 2;
  }

  function scrollByCards(dir) {
    const first = rail.querySelector('.post');
    const step = first ? first.getBoundingClientRect().width + 18 : rail.clientWidth * 0.8;
    rail.scrollBy({ left: dir * step, behavior: 'smooth' });
  }

  prev.addEventListener('click', () => scrollByCards(-1));
  next.addEventListener('click', () => scrollByCards(1));
  rail.addEventListener('scroll', updateNav, { passive: true });
  window.addEventListener('resize', updateNav);

  async function load() {
    try {
      const r = await fetch('/api/posts?limit=50');
      const data = await r.json();
      if (!data || !data.ok || !data.posts || !data.posts.length) {
        section.hidden = true;
        return;
      }
      rail.replaceChildren(...data.posts.map(card));
      section.hidden = false;
      requestAnimationFrame(updateNav);
    } catch {
      section.hidden = true;
    }
  }

  load();
})();
