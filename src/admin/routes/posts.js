// Статьи блога: создание, правка, удаление.
import {
  createPost,
  listRecentPosts,
  getPost,
  updatePostField,
  deletePost,
} from '../../lib/content-store.js';
import { uploadImage } from '../../lib/media.js';
import { readForm, redirect, str, guard, FormError } from '../forms.js';
import {
  btnLink,
  card,
  confirmPage,
  cut,
  empty,
  esc,
  fileField,
  fmtDate,
  form,
  h1,
  h2,
  input,
  layout,
  textarea,
} from '../views.js';

const ACTIVE = '/admin/posts';

// Анонс для карточки в ленте — первый абзац. Та же логика, что в updatePostField.
const excerptOf = (body) => (String(body).split(/\n\s*\n/)[0] || body).slice(0, 180).trim();

function listBlock(rows) {
  if (!rows.length) return empty('Статей пока нет.');
  return `<ul class="list">${rows
    .map(
      (r) => `<li class="list__it">
        <a class="list__link" href="/admin/posts/${r.id}">
          <span class="list__t">${esc(r.title || 'без заголовка')}</span>
          <span class="list__s">${esc(fmtDate(r.created_at))} · /blog/${esc(r.slug)}</span>
        </a>
      </li>`
    )
    .join('')}</ul>`;
}

export default async function postsRoutes(app) {
  app.get('/posts', async (req, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    const csrf = req.adminSession.csrf;
    return layout({
      title: 'Статьи',
      active: ACTIVE,
      query: req.query,
      csrf,
      body: [
        card(`
          ${h1('Новая статья')}
          ${form({
            action: '/admin/posts/new',
            csrf,
            multipart: true,
            submit: 'Опубликовать',
            body: [
              input({ name: 'title', label: 'Заголовок', required: true }),
              textarea({
                name: 'body',
                label: 'Текст статьи',
                rows: 14,
                required: true,
                hint: 'Абзацы разделяйте пустой строкой. Первый абзац станет анонсом в ленте.',
              }),
              fileField({
                name: 'photo',
                label: 'Фото (необязательно)',
                accept: 'image/*',
                hint: 'JPG, PNG или WEBP, до 8 МБ',
              }),
            ].join(''),
          })}
        `),
        card(`
          ${h2('Опубликованные статьи')}
          ${listBlock(listRecentPosts(30))}
        `),
      ].join(''),
    });
  });

  app.post(
    '/posts/new',
    guard('/admin/posts', async (req, reply) => {
      const { fields, files } = await readForm(req);
      const title = str(fields, 'title', 300);
      const body = str(fields, 'body', 100000);
      if (!title) throw new FormError('Заголовок пустой');
      if (!body) throw new FormError('Текст статьи пустой');

      let imageUrl = null;
      if (files.photo) {
        imageUrl = (await uploadImage(files.photo, 'blog')).url;
        req.log.info(`Панель: фото статьи загружено на CDN — ${imageUrl}`);
      }
      const r = createPost({ title, excerpt: excerptOf(body), body, imageUrl });
      req.log.info(`Панель: статья создана (id ${r.id}, slug ${r.slug}) — «${req.adminUser.login}».`);
      return redirect(reply, `/admin/posts/${r.id}`, {
        ok: `Статья опубликована: /blog/${r.slug}`,
      });
    })
  );

  app.get('/posts/:id', async (req, reply) => {
    const rec = getPost(req.params.id);
    if (!rec) return redirect(reply, '/admin/posts', { err: 'Статья не найдена — возможно, удалена' });
    const csrf = req.adminSession.csrf;
    reply.header('content-type', 'text/html; charset=utf-8');
    return layout({
      title: rec.title || 'Статья',
      active: ACTIVE,
      query: req.query,
      csrf,
      body: [
        card(`
          ${h1('Правка статьи')}
          <p class="muted">Адрес на сайте: <a href="/blog/${esc(rec.slug)}" target="_blank" rel="noopener">/blog/${esc(rec.slug)}</a> — он не меняется вместе с заголовком, чтобы не ломать уже разосланные ссылки.</p>
          ${form({
            action: `/admin/posts/${rec.id}`,
            csrf,
            multipart: true,
            submit: 'Сохранить',
            body: [
              input({ name: 'title', label: 'Заголовок', value: rec.title || '', required: true }),
              textarea({ name: 'body', label: 'Текст статьи', value: rec.body || '', rows: 16, required: true }),
              rec.image_url
                ? `<p class="muted">Текущее фото: <img class="thumb" src="${esc(rec.image_url)}" alt="Фото статьи" /></p>`
                : '<p class="muted">Фото нет.</p>',
              fileField({
                name: 'photo',
                label: 'Заменить фото',
                accept: 'image/*',
                hint: 'Оставьте пустым, чтобы не менять',
              }),
            ].join(''),
          })}
        `),
        card(`
          ${h2('Удаление')}
          ${btnLink(`/admin/posts/${rec.id}/delete`, 'Удалить статью', 'btn--danger')}
        `),
      ].join(''),
    });
  });

  app.post(
    '/posts/:id',
    guard((req) => `/admin/posts/${req.params.id}`, async (req, reply) => {
      const rec = getPost(req.params.id);
      if (!rec) throw new FormError('Статья не найдена');
      const { fields, files } = await readForm(req);
      const title = str(fields, 'title', 300);
      const body = str(fields, 'body', 100000);
      if (!title) throw new FormError('Заголовок пустой');
      if (!body) throw new FormError('Текст статьи пустой');

      updatePostField(rec.id, 'title', title);
      updatePostField(rec.id, 'body', body); // заодно пересобирает анонс
      if (files.photo) {
        const up = await uploadImage(files.photo, 'blog');
        updatePostField(rec.id, 'image_url', up.url);
        req.log.info(`Панель: фото статьи id ${rec.id} заменено — ${up.url}`);
      }
      req.log.info(`Панель: статья id ${rec.id} отредактирована — «${req.adminUser.login}».`);
      return redirect(reply, `/admin/posts/${rec.id}`, { ok: 'Сохранено, изменения уже на сайте.' });
    })
  );

  app.get('/posts/:id/delete', async (req, reply) => {
    const rec = getPost(req.params.id);
    if (!rec) return redirect(reply, '/admin/posts', { err: 'Статья не найдена' });
    reply.header('content-type', 'text/html; charset=utf-8');
    return layout({
      title: 'Удалить статью',
      active: ACTIVE,
      query: req.query,
      csrf: req.adminSession.csrf,
      body: confirmPage({
        question: `Удалить статью «${rec.title}»?`,
        details: cut(rec.excerpt || rec.body, 160),
        action: `/admin/posts/${rec.id}/delete`,
        csrf: req.adminSession.csrf,
        back: `/admin/posts/${rec.id}`,
      }),
    });
  });

  app.post(
    '/posts/:id/delete',
    guard((req) => `/admin/posts/${req.params.id}`, async (req, reply) => {
      await readForm(req);
      const changes = deletePost(req.params.id);
      req.log.info(`Панель: статья id ${req.params.id} удалена — «${req.adminUser.login}».`);
      return redirect(reply, '/admin/posts', {
        ok: changes ? 'Статья удалена с сайта.' : 'Статья уже была удалена.',
      });
    })
  );
}
