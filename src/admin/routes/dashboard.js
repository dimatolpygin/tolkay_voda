// Главная панели: что сейчас на сайте и куда идти.
import { db } from '../../lib/db.js';
import { listAds } from '../../lib/ads-store.js';
import { countTracks } from '../../lib/tracks-store.js';
import { card, esc, fmtDate, h1, layout } from '../views.js';

const lastForecast = db.prepare('SELECT id, date, subtitle FROM forecast ORDER BY date DESC, id DESC LIMIT 1');
const countPosts = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE published = 1');

const tile = (href, title, value) =>
  `<a class="tile" href="${href}">
    <span class="tile__t">${esc(title)}</span>
    <span class="tile__v">${esc(value)}</span>
  </a>`;

export default async function dashboardRoutes(app) {
  app.get('/', async (req, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    const f = lastForecast.get();
    const ads = listAds().length;

    return layout({
      title: 'Главная',
      active: '/admin',
      query: req.query,
      csrf: req.adminSession.csrf,
      body: [
        card(`
          ${h1(`Здравствуйте, ${req.adminUser.login}`)}
          <p class="muted">Отсюда меняется всё содержимое сайта. Правки видны посетителям в течение минуты — отдельная публикация не нужна.</p>
          <div class="tiles">
            ${tile('/admin/forecast', 'Прогноз дня', f ? fmtDate(f.date) : 'нет ни одного')}
            ${tile('/admin/posts', 'Статей в блоге', String(countPosts.get().n))}
            ${tile('/admin/tracks', 'Песен в эфире', String(countTracks()))}
            ${tile('/admin/ads', 'Баннеров стоит', `${ads} из 2`)}
          </div>
        `),
        card(`
          <p class="muted">Открыть сайт: <a href="/" target="_blank" rel="noopener">tolkay-voda.ru</a>.
          Если правка не видна — обновите страницу сайта, она кэшируется на минуту.</p>
        `),
      ].join(''),
    });
  });
}
