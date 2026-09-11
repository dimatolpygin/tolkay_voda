// Прогноз дня: создание через выжимку ИИ с предпросмотром, правка полей, удаление.
import {
  upsertForecast,
  listRecentForecasts,
  getForecast,
  updateForecastField,
  reprocessForecast,
  deleteForecast,
} from '../../lib/content-store.js';
import { prepareForecast, prepareForecastFallback, aiEnabled } from '../../lib/ai.js';
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
  hidden,
  input,
  layout,
  textarea,
} from '../views.js';

const ACTIVE = '/admin/forecast';

// Поля выжимки — один список на предпросмотр и на правку.
const PARTS = [
  ['subtitle', 'Лунный день', 'Например: 28-й Солнечный день, 1/2 Лунные дни'],
  ['intro', 'Вводка', 'Два-четыре предложения — их видно в свёрнутом блоке на главной'],
  ['water', 'Вода дня', ''],
  ['color', 'Цвет дня', ''],
  ['food', 'Еда дня', ''],
  ['advice', 'Совет дня', ''],
];

async function prepare(raw, log) {
  try {
    return aiEnabled() ? await prepareForecast(raw) : prepareForecastFallback(raw);
  } catch (err) {
    log.error({ err }, `Панель: выжимка ИИ не удалась — беру грубый разбор. ${err.message}`);
    return prepareForecastFallback(raw);
  }
}

function listBlock(rows) {
  if (!rows.length) return empty('Прогнозов пока нет.');
  return `<ul class="list">${rows
    .map(
      (r) => `<li class="list__it">
        <a class="list__link" href="/admin/forecast/${r.id}">
          <span class="list__t">${esc(fmtDate(r.date))}</span>
          <span class="list__s">${esc(r.subtitle || 'без лунного дня')}</span>
        </a>
      </li>`
    )
    .join('')}</ul>`;
}

export default async function forecastRoutes(app) {
  app.get('/forecast', async (req, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    const csrf = req.adminSession.csrf;
    return layout({
      title: 'Прогноз дня',
      active: ACTIVE,
      query: req.query,
      csrf,
      body: [
        card(`
          ${h1('Новый прогноз дня')}
          <p class="muted">Вставьте сырой текст целиком, как прислал автор. ${
            aiEnabled()
              ? 'Разберу его на поля и покажу предпросмотр — там всё можно поправить руками.'
              : 'Ключ OpenAI не задан, поэтому разберу грубо — поля заполните на предпросмотре сами.'
          }</p>
          ${form({
            action: '/admin/forecast/prepare',
            csrf,
            multipart: true,
            submit: 'Разобрать текст',
            body: [
              textarea({ name: 'raw', label: 'Текст прогноза', rows: 12, required: true }),
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
          ${h2('Опубликованные прогнозы')}
          ${listBlock(listRecentForecasts(15))}
        `),
      ].join(''),
    });
  });

  // Разбор сырого текста → страница предпросмотра. Ничего ещё не публикуется,
  // кроме фото: оно уходит в S3 сразу, иначе его пришлось бы держать в памяти.
  app.post(
    '/forecast/prepare',
    guard('/admin/forecast', async (req, reply) => {
      const { fields, files } = await readForm(req);
      const raw = str(fields, 'raw', 40000);
      if (!raw) throw new FormError('Текст прогноза пустой');

      const prepared = await prepare(raw, req.log);
      let imageUrl = '';
      if (files.photo) {
        const up = await uploadImage(files.photo, 'forecast');
        imageUrl = up.url;
        req.log.info(`Панель: фото прогноза загружено на CDN — ${imageUrl}`);
      }

      const csrf = req.adminSession.csrf;
      reply.header('content-type', 'text/html; charset=utf-8');
      return layout({
        title: 'Предпросмотр прогноза',
        active: ACTIVE,
        query: {},
        csrf,
        body: card(`
          ${h1('Предпросмотр')}
          <p class="muted">Проверьте поля и поправьте, если нужно. На сайт попадёт то, что здесь.</p>
          ${form({
            action: '/admin/forecast/publish',
            csrf,
            submit: 'Опубликовать',
            body: [
              ...PARTS.map(([name, label, hint]) =>
                name === 'intro'
                  ? textarea({ name, label, value: prepared[name] || '', rows: 5, hint })
                  : input({ name, label, value: prepared[name] || '', hint })
              ),
              textarea({
                name: 'full',
                label: 'Полный текст',
                value: prepared.full || '',
                rows: 14,
                hint: 'Его читают по кнопке «Развернуть» на главной',
              }),
              hidden('imageUrl', imageUrl),
              imageUrl
                ? `<p class="muted">Фото загружено: <img class="thumb" src="${esc(imageUrl)}" alt="Фото прогноза" /></p>`
                : '<p class="muted">Фото нет.</p>',
            ].join(''),
          })}
          ${btnLink('/admin/forecast', 'Отмена', 'btn--ghost')}
        `),
      });
    })
  );

  app.post(
    '/forecast/publish',
    guard('/admin/forecast', async (req, reply) => {
      const { fields } = await readForm(req);
      const full = str(fields, 'full', 40000);
      if (!full && !str(fields, 'intro', 4000)) {
        throw new FormError('Прогноз пустой — заполните хотя бы вводку');
      }
      const r = upsertForecast({
        subtitle: str(fields, 'subtitle', 200),
        intro: str(fields, 'intro', 4000),
        water: str(fields, 'water', 500),
        color: str(fields, 'color', 500),
        food: str(fields, 'food', 500),
        advice: str(fields, 'advice', 500),
        full,
        imageUrl: str(fields, 'imageUrl', 2000) || null,
      });
      req.log.info(
        `Панель: прогноз ${r.updated ? 'обновлён' : 'создан'} (id ${r.id}, дата ${r.date}) — «${req.adminUser.login}».`
      );
      return redirect(reply, `/admin/forecast/${r.id}`, {
        ok: `Прогноз ${r.updated ? 'обновлён' : 'опубликован'} на сайте, дата ${fmtDate(r.date)}.`,
      });
    })
  );

  app.get('/forecast/:id', async (req, reply) => {
    const rec = getForecast(req.params.id);
    if (!rec) return redirect(reply, '/admin/forecast', { err: 'Прогноз не найден — возможно, удалён' });
    const csrf = req.adminSession.csrf;
    reply.header('content-type', 'text/html; charset=utf-8');
    return layout({
      title: `Прогноз ${fmtDate(rec.date)}`,
      active: ACTIVE,
      query: req.query,
      csrf,
      body: [
        card(`
          ${h1(`Прогноз ${fmtDate(rec.date)}`)}
          ${form({
            action: `/admin/forecast/${rec.id}`,
            csrf,
            multipart: true,
            submit: 'Сохранить',
            body: [
              ...PARTS.map(([name, label, hint]) =>
                name === 'intro'
                  ? textarea({ name, label, value: rec[name] || '', rows: 5, hint })
                  : input({ name, label, value: rec[name] || '', hint })
              ),
              textarea({ name: 'body', label: 'Полный текст', value: rec.body || '', rows: 14 }),
              rec.image_url
                ? `<p class="muted">Текущее фото: <img class="thumb" src="${esc(rec.image_url)}" alt="Фото прогноза" /></p>`
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
          ${h2('Переписать текст заново')}
          <p class="muted">Вставьте новый сырой текст — ${
            aiEnabled() ? 'ИИ разберёт его' : 'разберу грубо, без ИИ'
          } и заменит все поля этого прогноза.</p>
          ${form({
            action: `/admin/forecast/${rec.id}/reprocess`,
            csrf,
            submit: 'Переписать',
            body: textarea({ name: 'raw', label: 'Новый текст прогноза', rows: 10, required: true }),
          })}
        `),
        card(`
          ${h2('Удаление')}
          ${btnLink(`/admin/forecast/${rec.id}/delete`, 'Удалить прогноз', 'btn--danger')}
        `),
      ].join(''),
    });
  });

  app.post(
    '/forecast/:id',
    guard((req) => `/admin/forecast/${req.params.id}`, async (req, reply) => {
      const rec = getForecast(req.params.id);
      if (!rec) throw new FormError('Прогноз не найден');
      const { fields, files } = await readForm(req);

      for (const [name] of PARTS) updateForecastField(rec.id, name, str(fields, name, 4000));
      updateForecastField(rec.id, 'body', str(fields, 'body', 40000));

      if (files.photo) {
        const up = await uploadImage(files.photo, 'forecast');
        updateForecastField(rec.id, 'image_url', up.url);
        req.log.info(`Панель: фото прогноза id ${rec.id} заменено — ${up.url}`);
      }
      req.log.info(`Панель: прогноз id ${rec.id} отредактирован — «${req.adminUser.login}».`);
      return redirect(reply, `/admin/forecast/${rec.id}`, { ok: 'Сохранено, изменения уже на сайте.' });
    })
  );

  app.post(
    '/forecast/:id/reprocess',
    guard((req) => `/admin/forecast/${req.params.id}`, async (req, reply) => {
      const rec = getForecast(req.params.id);
      if (!rec) throw new FormError('Прогноз не найден');
      const { fields } = await readForm(req);
      const raw = str(fields, 'raw', 40000);
      if (!raw) throw new FormError('Текст пустой');

      reprocessForecast(rec.id, await prepare(raw, req.log));
      req.log.info(`Панель: прогноз id ${rec.id} переписан из нового текста — «${req.adminUser.login}».`);
      return redirect(reply, `/admin/forecast/${rec.id}`, { ok: 'Прогноз переписан.' });
    })
  );

  app.get('/forecast/:id/delete', async (req, reply) => {
    const rec = getForecast(req.params.id);
    if (!rec) return redirect(reply, '/admin/forecast', { err: 'Прогноз не найден' });
    reply.header('content-type', 'text/html; charset=utf-8');
    return layout({
      title: 'Удалить прогноз',
      active: ACTIVE,
      query: req.query,
      csrf: req.adminSession.csrf,
      body: confirmPage({
        question: `Удалить прогноз за ${fmtDate(rec.date)}?`,
        details: cut(rec.intro || rec.body, 160),
        action: `/admin/forecast/${rec.id}/delete`,
        csrf: req.adminSession.csrf,
        back: `/admin/forecast/${rec.id}`,
      }),
    });
  });

  app.post(
    '/forecast/:id/delete',
    guard((req) => `/admin/forecast/${req.params.id}`, async (req, reply) => {
      await readForm(req);
      const changes = deleteForecast(req.params.id);
      req.log.info(`Панель: прогноз id ${req.params.id} удалён — «${req.adminUser.login}».`);
      return redirect(reply, '/admin/forecast', {
        ok: changes ? 'Прогноз удалён с сайта.' : 'Прогноз уже был удалён.',
      });
    })
  );
}
