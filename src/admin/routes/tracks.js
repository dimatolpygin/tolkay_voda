// Песни эфира: загрузка mp3, список, удаление.
import {
  insertTrack,
  nextPosition,
  listTracks,
  getTrack,
  deleteTrack,
  countTracks,
} from '../../lib/tracks-store.js';
import { regeneratePlaylist } from '../../lib/playlist.js';
import { deleteObject } from '../../lib/s3.js';
import { uploadAudio, MAX_AUDIO_BYTES } from '../../lib/media.js';
import { readForm, redirect, str, guard, FormError } from '../forms.js';
import {
  card,
  confirmPage,
  empty,
  esc,
  fileField,
  form,
  h1,
  h2,
  input,
  layout,
} from '../views.js';

const ACTIVE = '/admin/tracks';
const mb = (n) => Math.round(n / (1024 * 1024));

// Таблица целиком вместо постраничных кнопок бота по 8 штук.
// Плеера в списке нет намеренно: полсотни треков дали бы страницу в двадцать
// экранов. Послушать можно на шаге подтверждения удаления — там это и нужно.
function tableBlock(rows) {
  if (!rows.length) return empty('Песен в эфире пока нет.');
  return `<table class="tbl">
    <thead><tr><th>№</th><th>Название</th><th></th></tr></thead>
    <tbody>${rows
      .map(
        (t) => `<tr>
          <td class="tbl__n">${t.position}</td>
          <td class="tbl__t">${esc(t.title || 'без названия')}</td>
          <td class="tbl__a"><a class="btn btn--danger btn--sm" href="/admin/tracks/${t.id}/delete">Удалить</a></td>
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
}

export default async function tracksRoutes(app) {
  app.get('/tracks', async (req, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    const csrf = req.adminSession.csrf;
    const tracks = listTracks();
    return layout({
      title: 'Песни эфира',
      active: ACTIVE,
      query: req.query,
      csrf,
      body: [
        card(`
          ${h1('Добавить песню в эфир')}
          <p class="muted">Файл уйдёт в хранилище, песня встанет в конец ротации и появится в списке на сайте в течение минуты. Эфир при этом не прерывается.</p>
          ${form({
            action: '/admin/tracks/new',
            csrf,
            multipart: true,
            submit: 'Добавить в эфир',
            body: [
              fileField({
                name: 'audio',
                label: 'Файл mp3',
                accept: 'audio/*,.mp3',
                hint: `До ${mb(MAX_AUDIO_BYTES)} МБ`,
              }),
              input({
                name: 'title',
                label: 'Название песни',
                required: true,
                hint: 'По-русски — так, как показывать на сайте',
              }),
            ].join(''),
          })}
        `),
        card(`
          ${h2(`Песни в эфире (${tracks.length})`)}
          ${tableBlock(tracks)}
        `),
      ].join(''),
    });
  });

  app.post(
    '/tracks/new',
    guard('/admin/tracks', async (req, reply) => {
      const { fields, files } = await readForm(req);
      const title = str(fields, 'title', 200);
      if (!title) throw new FormError('Название песни пустое');
      if (!files.audio) throw new FormError('Файл не выбран — приложите mp3');

      const position = nextPosition();
      const { url, key } = await uploadAudio(files.audio, position, title);
      const r = insertTrack({ title, artist: 'Клан Толкай Вода', s3Key: key, url, position });
      const n = await regeneratePlaylist();
      req.log.info(
        `Панель: песня добавлена (id ${r.id}, поз ${position}) «${title}» → ${url}; ` +
          `плейлист пересобран (${n} треков) — «${req.adminUser.login}».`
      );
      return redirect(reply, '/admin/tracks', {
        ok: `Песня «${title}» в эфире. Всего треков: ${n}.`,
      });
    })
  );

  app.get('/tracks/:id/delete', async (req, reply) => {
    const t = getTrack(req.params.id);
    if (!t) return redirect(reply, '/admin/tracks', { err: 'Песня не найдена' });
    reply.header('content-type', 'text/html; charset=utf-8');
    return layout({
      title: 'Удалить песню',
      active: ACTIVE,
      query: req.query,
      csrf: req.adminSession.csrf,
      body: [
        confirmPage({
          question: `Удалить песню «${t.title}» из эфира?`,
          details: 'Файл будет удалён и из хранилища.',
          action: `/admin/tracks/${t.id}/delete`,
          csrf: req.adminSession.csrf,
          back: '/admin/tracks',
        }),
        card(`<audio class="aud" controls preload="none" src="${esc(t.url)}"></audio>`),
      ].join(''),
    });
  });

  app.post(
    '/tracks/:id/delete',
    guard('/admin/tracks', async (req, reply) => {
      await readForm(req);
      const t = getTrack(req.params.id);
      if (!t) throw new FormError('Песня уже удалена');
      // Пустой плейлист — это немой эфир, а вернуть трек обратно можно только
      // повторной загрузкой файла. Поэтому последнюю песню не отдаём.
      if (countTracks() <= 1) {
        throw new FormError('Нельзя удалить последнюю песню — эфир останется без музыки. Сначала добавьте другую.');
      }

      deleteTrack(t.id);
      try {
        await deleteObject(t.s3_key);
      } catch (err) {
        req.log.warn(`Панель: объект S3 ${t.s3_key} не удалён — ${err.message}`);
      }
      const n = await regeneratePlaylist();
      req.log.info(
        `Панель: песня удалена (id ${t.id}) «${t.title}»; плейлист пересобран (${n} треков) — «${req.adminUser.login}».`
      );
      return redirect(reply, '/admin/tracks', {
        ok: `Песня «${t.title}» удалена. Осталось треков: ${n}.`,
      });
    })
  );
}
