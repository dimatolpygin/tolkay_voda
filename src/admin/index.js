// Панель управления сайтом (этап 17) — часть того же Fastify-приложения.
// Отдельный сервис и контейнер не заводим: сервер одноядерный, а панель — это
// десяток страниц поверх уже существующего слоя данных.
//
// Всё под /admin закрыто сессией, не индексируется и не кэшируется.
import multipart from '@fastify/multipart';
import { MAX_AUDIO_BYTES } from '../lib/media.js';
import { COOKIE_NAME, ensureSeedAdmin, getSession, readCookie } from './auth.js';

import dashboardRoutes from './routes/dashboard.js';
import authRoutes from './routes/auth.js';
import forecastRoutes from './routes/forecast.js';
import postsRoutes from './routes/posts.js';
import tracksRoutes from './routes/tracks.js';
import adsRoutes from './routes/ads.js';

const PUBLIC_PATHS = new Set(['/admin/login']);
// Страницы, доступные до принудительной смены пароля на первом входе.
const PASSWORD_EXEMPT = new Set(['/admin/password', '/admin/logout', '/admin/login']);

export default async function adminPlugin(app) {
  await ensureSeedAdmin();

  // Файлы приходят прямо из браузера, без потолка Telegram в 20 МБ.
  await app.register(multipart, {
    // fieldSize с запасом: длинная статья на кириллице занимает вдвое больше
    // байт, чем символов, и упираться в лимит на полпути она не должна.
    limits: { fileSize: MAX_AUDIO_BYTES, files: 2, fields: 40, fieldSize: 1_000_000 },
  });

  // Обычные формы. Ради одного парсера тянуть @fastify/formbody незачем.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (req, body, done) => {
      try {
        done(null, Object.fromEntries(new URLSearchParams(body)));
      } catch (err) {
        done(err);
      }
    }
  );

  app.decorateRequest('adminSession', null);
  app.decorateRequest('adminUser', null);

  // Панель не должна попасть в поиск (иначе ломается SEO этапа 12) и не должна
  // оседать в кэшах прокси — в ответах лежит содержимое, доступное только по входу.
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('x-robots-tag', 'noindex, nofollow');
    reply.header('cache-control', 'no-store');
    reply.header('referrer-policy', 'same-origin');
    reply.header('x-frame-options', 'DENY'); // чужая страница не вставит панель в iframe
    // Скриптов в панели нет вовсе — запрещаем их целиком. Картинки и аудио
    // приходят с CDN, формы уходят только на свой домен.
    reply.header(
      'content-security-policy',
      "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' https: data:; " +
        "media-src 'self' https:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
    );
    return payload;
  });

  app.addHook('preHandler', async (req, reply) => {
    const path = req.url.split('?')[0].replace(/\/+$/, '') || '/admin';

    // Первый рубеж против CSRF: форму с чужого сайта отсекаем по Origin,
    // ещё до того как сверять токен формы (это делает readForm).
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin && origin !== 'null') {
        let same = false;
        try {
          same = new URL(origin).host === req.headers.host;
        } catch {
          same = false;
        }
        if (!same) {
          req.log.warn(`Панель: POST ${path} с чужого источника ${origin} — отклонён.`);
          return reply.code(403).send({ ok: false, error: 'cross_site' });
        }
      }
    }

    const found = getSession(readCookie(req, COOKIE_NAME));
    if (found) {
      req.adminSession = found.session;
      req.adminUser = found.admin;
    }

    if (PUBLIC_PATHS.has(path)) return;

    if (!found) {
      const back = req.method === 'GET' ? '' : '?err=' + encodeURIComponent('Сессия истекла — войдите заново');
      return reply.code(303).header('location', `/admin/login${back}`).send();
    }

    if (found.admin.must_change_password && !PASSWORD_EXEMPT.has(path)) {
      return reply.code(303).header('location', '/admin/password').send();
    }
  });

  // Опечатка в адресе внутри панели не должна отдавать главную сайта
  // (корневой 404-обработчик именно это и делает) — возвращаем на главную панели.
  app.setNotFoundHandler((req, reply) =>
    reply.code(303).header('location', '/admin').send()
  );

  await app.register(authRoutes);
  await app.register(dashboardRoutes);
  await app.register(forecastRoutes);
  await app.register(postsRoutes);
  await app.register(tracksRoutes);
  await app.register(adsRoutes);
}
