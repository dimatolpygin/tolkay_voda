// Блог: сетка статей с пагинацией. Данные из /api/posts?page=N.
// Клик по карточке ведёт на отдельную страницу статьи /post.html?slug=...
(() => {
  const section = document.getElementById('blog');
  if (!section) return;

  const grid = document.getElementById('blogGrid');
  const pager = document.getElementById('blogPager');

  const MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];

  // "YYYY-MM-DD HH:MM:SS" → "16 июня 2026"
  function formatDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    if (!m) return '';
    return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  }

  function card(p) {
    const a = document.createElement('a');
    a.className = 'post';
    a.href = `/post.html?slug=${encodeURIComponent(p.slug)}`;

    const img = document.createElement('img');
    img.className = 'post__img';
    img.loading = 'lazy';
    img.alt = p.title || '';
    img.src = p.image_url || '/assets/img/cover-default.webp';

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

  function renderPager(page, pages) {
    pager.innerHTML = '';
    if (pages <= 1) return;
    for (let i = 1; i <= pages; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(i);
      if (i === page) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => load(i));
      pager.append(b);
    }
  }

  async function load(page = 1) {
    try {
      const r = await fetch(`/api/posts?page=${page}`);
      const data = await r.json();
      if (!data || !data.ok || !data.posts || !data.posts.length) {
        section.hidden = true; // нет статей — раздел не показываем
        return;
      }
      grid.innerHTML = '';
      for (const p of data.posts) grid.append(card(p));
      renderPager(data.page, data.pages);
      section.hidden = false;
      // при перелистывании подскроллим к началу блога
      if (page !== 1) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      section.hidden = true;
    }
  }

  load(1);
})();
