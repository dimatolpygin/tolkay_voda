// Рекламные баннеры: два слота под плеером (таблица ads из этапа 16).
// Меняются без передеплоя — главная пересобирается при изменении набора баннеров.
import { AD_SLOTS, getAdRaw, setAd, clearAd, normalizeSlot } from '../../lib/ads-store.js';
import { uploadImage } from '../../lib/media.js';
import { imageSize, adImageWarning } from '../../lib/image-info.js';
import { deleteObject } from '../../lib/s3.js';
import { readForm, redirect, str, guard, FormError } from '../forms.js';
import {
  btnLink,
  card,
  confirmPage,
  esc,
  fileField,
  form,
  h1,
  h2,
  input,
  layout,
} from '../views.js';

const ACTIVE = '/admin/ads';

function slotCard(slot, csrf) {
  const ad = getAdRaw(slot);
  const preview = ad
    ? `<p class="muted">Сейчас в слоте:</p>
       <img class="thumb thumb--wide" src="${esc(ad.image_url)}" alt="Баннер слота ${slot}" />
       <p class="muted">Ведёт на: ${esc(ad.link_url)}</p>`
    : '<p class="muted">Слот пуст — на сайте этого баннера нет.</p>';

  return card(`
    ${h2(`Слот ${slot}`)}
    ${preview}
    ${form({
      action: `/admin/ads/${slot}`,
      csrf,
      multipart: true,
      submit: ad ? 'Заменить баннер' : 'Поставить баннер',
      body: [
        fileField({
          name: 'image',
          label: 'Картинка баннера',
          accept: 'image/*',
          hint: 'Ровно 16:9 — лучше 1200×675. Картинку другого формата на сайте обрежет по краям. JPG, PNG или WEBP до 8 МБ.',
        }),
        input({
          name: 'imageUrl',
          label: 'Или ссылка на картинку',
          value: ad?.image_url || '',
          type: 'url',
          hint: 'Заполняйте, если картинка уже лежит в интернете. Загруженный файл важнее этого поля.',
        }),
        input({
          name: 'linkUrl',
          label: 'Куда ведёт баннер',
          value: ad?.link_url || '',
          type: 'url',
          required: true,
          hint: 'Адрес целиком, вместе с https://',
        }),
        input({
          name: 'buttonText',
          label: 'Текст кнопки (необязательно)',
          value: ad?.button_text || '',
          hint: 'Пусто — кликабельна вся картинка, без кнопки',
          maxlength: '40',
        }),
      ].join(''),
    })}
    ${ad ? btnLink(`/admin/ads/${slot}/delete`, 'Снять баннер', 'btn--danger') : ''}
  `);
}

export default async function adsRoutes(app) {
  app.get('/ads', async (req, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    const csrf = req.adminSession.csrf;
    return layout({
      title: 'Баннеры',
      active: ACTIVE,
      query: req.query,
      csrf,
      body: [
        card(`
          ${h1('Баннеры под плеером')}
          <p class="muted">Два места на главной, сразу под плеером. Можно занять одно — тогда баннер встанет по центру. Изменения видны на сайте в течение минуты, передеплой не нужен.</p>
        `),
        ...AD_SLOTS.map((slot) => slotCard(slot, csrf)),
      ].join(''),
    });
  });

  app.post(
    '/ads/:slot',
    guard('/admin/ads', async (req, reply) => {
      const slot = normalizeSlot(req.params.slot);
      if (!slot) throw new FormError('Слот баннера должен быть 1 или 2');
      const { fields, files } = await readForm(req);

      const before = getAdRaw(slot);
      let imageUrl = str(fields, 'imageUrl', 2000);
      let imageKey = before?.image_key || '';
      let warning = '';

      if (files.image) {
        // Картинку меряем до загрузки: карточка на сайте всегда 16:9 с обрезкой
        // по краям, и логотип вместо баннера превращается в размытый обрезок.
        warning = adImageWarning(imageSize(files.image.buffer));
        const up = await uploadImage(files.image, 'ads');
        // Старый файл удаляем только после успешной загрузки нового —
        // иначе при сбое слот остался бы вообще без картинки.
        if (before?.image_key && before.image_key !== up.key) {
          try {
            await deleteObject(before.image_key);
          } catch (err) {
            req.log.warn(`Панель: старая картинка баннера ${before.image_key} не удалена — ${err.message}`);
          }
        }
        imageUrl = up.url;
        imageKey = up.key;
      } else if (imageUrl && before && imageUrl !== before.image_url) {
        // Картинку заменили ссылкой — ранее загруженный файл больше не нужен.
        imageKey = '';
        if (before.image_key) {
          try {
            await deleteObject(before.image_key);
          } catch (err) {
            req.log.warn(`Панель: старая картинка баннера ${before.image_key} не удалена — ${err.message}`);
          }
        }
      }

      if (!imageUrl) throw new FormError('Нужна картинка: загрузите файл или дайте ссылку');

      setAd({
        slot,
        imageKey,
        imageUrl,
        linkUrl: str(fields, 'linkUrl', 2000),
        buttonText: str(fields, 'buttonText', 40),
      });
      req.log.info(
        `Панель: баннер в слоте ${slot} обновлён — «${req.adminUser.login}».` +
          (warning ? ` Предупреждение: ${warning}` : '')
      );
      return redirect(
        reply,
        '/admin/ads',
        warning ? { warn: warning } : { ok: `Баннер в слоте ${slot} сохранён.` }
      );
    })
  );

  app.get('/ads/:slot/delete', async (req, reply) => {
    const slot = normalizeSlot(req.params.slot);
    if (!slot) return redirect(reply, '/admin/ads', { err: 'Слот баннера должен быть 1 или 2' });
    reply.header('content-type', 'text/html; charset=utf-8');
    return layout({
      title: 'Снять баннер',
      active: ACTIVE,
      query: req.query,
      csrf: req.adminSession.csrf,
      body: confirmPage({
        question: `Снять баннер со слота ${slot}?`,
        details: 'Место на сайте останется пустым, загруженная картинка будет удалена.',
        action: `/admin/ads/${slot}/delete`,
        csrf: req.adminSession.csrf,
        back: '/admin/ads',
      }),
    });
  });

  app.post(
    '/ads/:slot/delete',
    guard('/admin/ads', async (req, reply) => {
      const slot = normalizeSlot(req.params.slot);
      if (!slot) throw new FormError('Слот баннера должен быть 1 или 2');
      await readForm(req);

      const before = getAdRaw(slot);
      clearAd(slot);
      if (before?.image_key) {
        try {
          await deleteObject(before.image_key);
        } catch (err) {
          req.log.warn(`Панель: картинка баннера ${before.image_key} не удалена — ${err.message}`);
        }
      }
      req.log.info(`Панель: баннер снят со слота ${slot} — «${req.adminUser.login}».`);
      return redirect(reply, '/admin/ads', { ok: `Слот ${slot} освобождён.` });
    })
  );
}
