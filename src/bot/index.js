// Telegram-бот контента: пошаговый сценарий (FSM) с инлайн-кнопками.
// Прогноз дня проходит через ИИ-выжимку (OpenAI). Доступ — только whitelist.
import { Bot, InlineKeyboard } from 'grammy';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import {
  upsertForecast,
  createPost,
  listRecentForecasts,
  listRecentPosts,
  getForecast,
  getPost,
  updateForecastField,
  updatePostField,
  reprocessForecast,
  deleteForecast,
  deletePost,
} from './store.js';
import { largestPhoto, uploadTelegramPhoto } from './media.js';
import { prepareForecast, prepareForecastFallback, aiEnabled } from '../lib/ai.js';

if (!config.bot.token) {
  logger.error('BOT_TOKEN не задан в .env — бот не запущен.');
  process.exit(1);
}
if (!config.bot.adminIds.length) {
  logger.warn('BOT_ADMIN_IDS пуст — постить контент не сможет никто. Заполните .env.');
}
if (!aiEnabled()) {
  logger.warn('OPENAI_API_KEY не задан — прогноз будет готовиться грубым фолбэком без ИИ.');
}

const bot = new Bot(config.bot.token);

// --- Состояние диалога по userId ---
// { type: 'forecast'|'post', step, rawText, photoFileId, prepared }
const sessions = new Map();
const getState = (id) => sessions.get(id);
const setState = (id, s) => sessions.set(id, s);
const clearState = (id) => sessions.delete(id);

// --- Утилиты ---
function who(ctx) {
  const u = ctx.from || {};
  return { id: u.id, username: u.username || '—', name: u.first_name || '' };
}
function preview(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > 90 ? s.slice(0, 90) + '…' : s;
}
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}
async function reply(ctx, text, extra) {
  await ctx.reply(text, extra);
  logger.info(`Бот -> @${who(ctx).username}: ${preview(text)}`);
}

const kbType = () =>
  new InlineKeyboard()
    .text('Прогноз дня', 'type:forecast')
    .text('Статья в блог', 'type:post')
    .row()
    .text('Редактировать', 'edit:menu');
const kbPhoto = () =>
  new InlineKeyboard().text('Без фото', 'photo:skip').text('Отмена', 'cancel');
const kbPublish = () =>
  new InlineKeyboard().text('Опубликовать', 'publish').text('Отмена', 'cancel');

// --- Клавиатуры редактирования ---
const kbEditMenu = () =>
  new InlineKeyboard()
    .text('Прогнозы', 'edit:list:forecast')
    .text('Статьи', 'edit:list:post');

// Список записей: по кнопке на запись + «Отмена».
function kbEditList(type, rows) {
  const kb = new InlineKeyboard();
  for (const r of rows) {
    const label = type === 'forecast' ? labelForecast(r) : labelPost(r);
    kb.text(label, `edit:pick:${type}:${r.id}`).row();
  }
  kb.text('Отмена', 'cancel');
  return kb;
}

// Меню полей выбранной записи.
function kbEditFields(type, id) {
  const kb = new InlineKeyboard();
  if (type === 'forecast') {
    kb.text('Текст заново (ИИ)', `edit:field:forecast:${id}:raw`).row()
      .text('Вводка', `edit:field:forecast:${id}:intro`)
      .text('Вода', `edit:field:forecast:${id}:water`).row()
      .text('Цвет', `edit:field:forecast:${id}:color`)
      .text('Еда', `edit:field:forecast:${id}:food`).row()
      .text('Совет', `edit:field:forecast:${id}:advice`)
      .text('Лунный день', `edit:field:forecast:${id}:subtitle`).row()
      .text('Фото', `edit:field:forecast:${id}:image_url`).row()
      .text('Удалить', `edit:del:forecast:${id}`)
      .text('Отмена', 'cancel');
  } else {
    kb.text('Заголовок', `edit:field:post:${id}:title`)
      .text('Текст', `edit:field:post:${id}:body`).row()
      .text('Фото', `edit:field:post:${id}:image_url`).row()
      .text('Удалить', `edit:del:post:${id}`)
      .text('Отмена', 'cancel');
  }
  return kb;
}

const kbDelConfirm = (type, id) =>
  new InlineKeyboard()
    .text('Да, удалить', `edit:delyes:${type}:${id}`)
    .text('Отмена', 'cancel');

function labelForecast(r) {
  const d = fmtDate(r.date);
  const sub = (r.subtitle || '').slice(0, 28);
  return sub ? `${d} · ${sub}` : `${d} · прогноз`;
}
function labelPost(r) {
  const t = (r.title || 'без заголовка').slice(0, 40);
  return `${fmtDate(r.created_at)} · ${t}`;
}

// Человекочитаемые названия полей для подсказок.
const FIELD_RU = {
  raw: 'полный текст прогноза (перепишу через ИИ)',
  intro: 'вводку (краткое описание дня)',
  water: 'Воду дня',
  color: 'Цвет дня',
  food: 'Еду дня',
  advice: 'Совет дня',
  subtitle: 'строку лунного дня',
  title: 'заголовок',
  body: 'текст статьи',
  image_url: 'фото',
};

const HELP = [
  'Бот клана «Толкай Вода». Публикую контент на сайте.',
  '',
  'Нажмите /start и выберите, что добавить: прогноз дня или статью в блог.',
  'Дальше я проведу по шагам: текст → фото → предпросмотр → публикация.',
  '',
  '/edit — отредактировать или удалить уже опубликованный прогноз или статью.',
].join('\n');

// --- Логирование входящих ---
bot.use(async (ctx, next) => {
  const u = who(ctx);
  const text =
    ctx.message?.text ||
    ctx.message?.caption ||
    ctx.callbackQuery?.data ||
    (ctx.message?.photo ? '(фото)' : '(служебное)');
  logger.info(`Вход @${u.username} (id:${u.id}, ${u.name}) -> ${preview(text)}`);
  await next();
});

// --- Whitelist ---
bot.use(async (ctx, next) => {
  const u = who(ctx);
  if (!config.bot.adminIds.includes(u.id)) {
    logger.warn(`Отказ: @${u.username} (id:${u.id}) не в whitelist — игнор.`);
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Нет доступа' }).catch(() => {});
    return;
  }
  await next();
});

// --- Команды ---
bot.command('help', (ctx) => reply(ctx, HELP));
bot.command(['start', 'add'], (ctx) => {
  clearState(who(ctx).id);
  return reply(ctx, 'Что добавить на сайт?', { reply_markup: kbType() });
});
bot.command('cancel', (ctx) => {
  clearState(who(ctx).id);
  return reply(ctx, 'Отменено. Нажмите /start, чтобы начать заново.');
});
bot.command('edit', (ctx) => {
  clearState(who(ctx).id);
  return reply(ctx, 'Что отредактировать?', { reply_markup: kbEditMenu() });
});

// --- Выбор типа ---
bot.callbackQuery('type:forecast', async (ctx) => {
  await ctx.answerCallbackQuery();
  setState(who(ctx).id, { type: 'forecast', step: 'await_text' });
  await reply(
    ctx,
    'Прогноз дня. Пришлите сырой текст прогноза целиком (можно сразу с фото — приложите картинку с подписью).'
  );
});
bot.callbackQuery('type:post', async (ctx) => {
  await ctx.answerCallbackQuery();
  setState(who(ctx).id, { type: 'post', step: 'await_title' });
  await reply(ctx, 'Статья в блог. Шаг 1 из 3: пришлите заголовок статьи одной строкой.');
});

// --- Пропустить фото ---
bot.callbackQuery('photo:skip', async (ctx) => {
  await ctx.answerCallbackQuery();
  const st = getState(who(ctx).id);
  if (!st || st.step !== 'await_photo') return;
  st.photoFileId = null;
  await toPreview(ctx, st);
});

// --- Отмена ---
bot.callbackQuery('cancel', async (ctx) => {
  await ctx.answerCallbackQuery();
  clearState(who(ctx).id);
  await reply(ctx, 'Отменено. Нажмите /start, чтобы начать заново.');
});

// --- Публикация ---
bot.callbackQuery('publish', async (ctx) => {
  await ctx.answerCallbackQuery();
  const st = getState(who(ctx).id);
  if (!st || st.step !== 'preview') {
    return reply(ctx, 'Нечего публиковать. Нажмите /start.');
  }
  try {
    let imageUrl = null;
    if (st.photoFileId) {
      const prefix = st.type === 'forecast' ? 'forecast' : 'blog';
      imageUrl = await uploadTelegramPhoto(ctx.api, st.photoFileId, prefix);
      logger.info(`Фото загружено на CDN: ${imageUrl}`);
    }

    if (st.type === 'forecast') {
      const r = upsertForecast({ ...st.prepared, imageUrl });
      logger.info(`Прогноз ${r.updated ? 'обновлён' : 'создан'} (id ${r.id}, дата ${r.date}).`);
      clearState(who(ctx).id);
      await reply(
        ctx,
        `Прогноз дня ${r.updated ? 'обновлён' : 'опубликован'} на сайте. Дата: ${fmtDate(r.date)}.` +
          (imageUrl ? `\nФото: ${imageUrl}` : '')
      );
    } else {
      const r = createPost({ ...st.prepared, imageUrl });
      logger.info(`Статья создана (id ${r.id}, slug ${r.slug}).`);
      clearState(who(ctx).id);
      await reply(ctx, `Статья опубликована: «${st.prepared.title}». Открыть: /post.html?slug=${r.slug}`);
    }
  } catch (e) {
    logger.error(`Ошибка публикации: ${e.message}`);
    await reply(ctx, `Не удалось опубликовать: ${e.message}. Попробуйте ещё раз: /start`);
  }
});

// --- Редактирование: навигация по callback ---
bot.callbackQuery('edit:menu', async (ctx) => {
  await ctx.answerCallbackQuery();
  clearState(who(ctx).id);
  await reply(ctx, 'Что отредактировать?', { reply_markup: kbEditMenu() });
});

bot.callbackQuery(/^edit:list:(forecast|post)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const type = ctx.match[1];
  const rows = type === 'forecast' ? listRecentForecasts(10) : listRecentPosts(10);
  if (!rows.length) {
    return reply(ctx, type === 'forecast' ? 'Прогнозов пока нет.' : 'Статей пока нет.');
  }
  await reply(ctx, `Выберите запись (последние ${rows.length}):`, {
    reply_markup: kbEditList(type, rows),
  });
});

bot.callbackQuery(/^edit:pick:(forecast|post):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const type = ctx.match[1];
  const id = Number(ctx.match[2]);
  const rec = type === 'forecast' ? getForecast(id) : getPost(id);
  if (!rec) return reply(ctx, 'Запись не найдена (возможно, удалена). /edit — начать заново.');
  setState(who(ctx).id, { mode: 'edit', editType: type, editId: id, step: 'menu' });
  const summary =
    type === 'forecast'
      ? `Прогноз ${fmtDate(rec.date)}${rec.subtitle ? ' · ' + rec.subtitle : ''}`
      : `Статья: «${rec.title}»`;
  await reply(ctx, `${summary}\nЧто меняем?`, { reply_markup: kbEditFields(type, id) });
});

bot.callbackQuery(/^edit:field:(forecast|post):(\d+):(\w+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const type = ctx.match[1];
  const id = Number(ctx.match[2]);
  const field = ctx.match[3];
  const rec = type === 'forecast' ? getForecast(id) : getPost(id);
  if (!rec) return reply(ctx, 'Запись не найдена. /edit — начать заново.');
  const kbCancel = new InlineKeyboard().text('Отмена', 'cancel');
  if (field === 'image_url') {
    setState(who(ctx).id, { mode: 'edit', editType: type, editId: id, editField: field, step: 'await_photo' });
    return reply(ctx, 'Пришлите новое фото для этой записи.', { reply_markup: kbCancel });
  }
  setState(who(ctx).id, { mode: 'edit', editType: type, editId: id, editField: field, step: 'await_value' });
  return reply(ctx, `Пришлите новое значение: ${FIELD_RU[field] || field}.`, { reply_markup: kbCancel });
});

bot.callbackQuery(/^edit:del:(forecast|post):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const type = ctx.match[1];
  const id = Number(ctx.match[2]);
  await reply(ctx, 'Удалить запись безвозвратно?', { reply_markup: kbDelConfirm(type, id) });
});

bot.callbackQuery(/^edit:delyes:(forecast|post):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const type = ctx.match[1];
  const id = Number(ctx.match[2]);
  const changes = type === 'forecast' ? deleteForecast(id) : deletePost(id);
  clearState(who(ctx).id);
  if (!changes) return reply(ctx, 'Запись уже отсутствует.');
  logger.info(`Удалено: ${type} id ${id} (@${who(ctx).username}).`);
  await reply(ctx, type === 'forecast' ? 'Прогноз удалён с сайта.' : 'Статья удалена с сайта.');
});

// Применение правки текстового поля.
async function applyEditText(ctx, st, text) {
  const value = (text || '').trim();
  if (!value) return reply(ctx, 'Пустое значение. Пришлите текст ещё раз.');
  const { editType, editId, editField } = st;
  const rec = editType === 'forecast' ? getForecast(editId) : getPost(editId);
  if (!rec) {
    clearState(who(ctx).id);
    return reply(ctx, 'Запись не найдена. /edit — начать заново.');
  }
  try {
    if (editType === 'forecast' && editField === 'raw') {
      let prepared;
      try {
        prepared = aiEnabled() ? await prepareForecast(value) : prepareForecastFallback(value);
      } catch (e) {
        logger.error(`ИИ-выжимка не удалась: ${e.message}`);
        prepared = prepareForecastFallback(value);
      }
      reprocessForecast(editId, prepared);
      logger.info(`Прогноз id ${editId} переработан через ИИ (@${who(ctx).username}).`);
    } else if (editType === 'forecast') {
      updateForecastField(editId, editField, value);
      logger.info(`Прогноз id ${editId}: поле ${editField} обновлено (@${who(ctx).username}).`);
    } else {
      updatePostField(editId, editField, value);
      logger.info(`Статья id ${editId}: поле ${editField} обновлено (@${who(ctx).username}).`);
    }
  } catch (e) {
    logger.error(`Ошибка правки: ${e.message}`);
    return reply(ctx, `Не удалось сохранить: ${e.message}`);
  }
  clearState(who(ctx).id);
  return reply(ctx, 'Готово, изменения сохранены и уже на сайте. /edit — править ещё.');
}

// Применение нового фото к записи.
async function applyEditPhoto(ctx, st, photoFileId) {
  if (!photoFileId) return reply(ctx, 'Не вижу фото. Пришлите изображение.');
  const { editType, editId } = st;
  const rec = editType === 'forecast' ? getForecast(editId) : getPost(editId);
  if (!rec) {
    clearState(who(ctx).id);
    return reply(ctx, 'Запись не найдена. /edit — начать заново.');
  }
  try {
    const prefix = editType === 'forecast' ? 'forecast' : 'blog';
    const imageUrl = await uploadTelegramPhoto(ctx.api, photoFileId, prefix);
    if (editType === 'forecast') updateForecastField(editId, 'image_url', imageUrl);
    else updatePostField(editId, 'image_url', imageUrl);
    logger.info(`${editType} id ${editId}: фото обновлено → ${imageUrl} (@${who(ctx).username}).`);
  } catch (e) {
    logger.error(`Ошибка загрузки фото: ${e.message}`);
    return reply(ctx, `Не удалось обновить фото: ${e.message}`);
  }
  clearState(who(ctx).id);
  return reply(ctx, 'Фото обновлено на сайте. /edit — править ещё.');
}

// --- Приём текста и фото в зависимости от шага ---
bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const st = getState(who(ctx).id);
  if (!st) return reply(ctx, 'Нажмите /start и выберите тип контента.', { reply_markup: kbType() });
  if (st.mode === 'edit') {
    if (st.step === 'await_value') return applyEditText(ctx, st, ctx.message.text);
    if (st.step === 'await_photo') return reply(ctx, 'Жду фото, не текст. Пришлите изображение или «Отмена».');
    return reply(ctx, 'Выберите поле кнопкой или нажмите «Отмена».');
  }
  return onText(ctx, st, ctx.message.text, null);
});

bot.on(':photo', async (ctx) => {
  const st = getState(who(ctx).id);
  const ph = largestPhoto(ctx.message.photo);
  const caption = ctx.message.caption || '';
  if (!st) return reply(ctx, 'Нажмите /start и выберите тип контента.', { reply_markup: kbType() });
  if (st.mode === 'edit') {
    if (st.step === 'await_photo') return applyEditPhoto(ctx, st, ph?.file_id || null);
    return reply(ctx, 'Сейчас фото не жду. Выберите поле кнопкой или «Отмена».');
  }
  if (st.step === 'await_photo') {
    st.photoFileId = ph?.file_id || null;
    return toPreview(ctx, st);
  }
  // фото пришло на текстовом шаге — берём подпись как текст и фото сразу
  return onText(ctx, st, caption, ph?.file_id || null);
});

// Маршрутизация текста по шагам сценария.
async function onText(ctx, st, text, photoFileId) {
  const trimmed = (text || '').trim();

  // --- Прогноз: один текстовый шаг ---
  if (st.type === 'forecast') {
    if (st.step !== 'await_text') {
      return reply(ctx, 'Сейчас жду действие кнопкой. /start — начать заново.');
    }
    if (!trimmed) return reply(ctx, 'Пустой текст. Пришлите прогноз ещё раз.');
    st.rawText = trimmed;
    if (photoFileId) {
      st.photoFileId = photoFileId;
      return toPreview(ctx, st);
    }
    st.step = 'await_photo';
    return reply(ctx, 'Принял текст. Пришлите фото для записи или нажмите «Без фото».', {
      reply_markup: kbPhoto(),
    });
  }

  // --- Статья: заголовок → текст → фото ---
  if (st.step === 'await_title') {
    if (!trimmed) return reply(ctx, 'Заголовок пустой. Пришлите заголовок одной строкой.');
    st.title = trimmed.split('\n')[0].trim();
    st.step = 'await_body';
    return reply(ctx, `Заголовок принят: «${st.title}».\nШаг 2 из 3: пришлите текст статьи.`);
  }
  if (st.step === 'await_body') {
    if (!trimmed) return reply(ctx, 'Текст пустой. Пришлите текст статьи.');
    st.body = trimmed;
    if (photoFileId) {
      st.photoFileId = photoFileId;
      return toPreview(ctx, st);
    }
    st.step = 'await_photo';
    return reply(ctx, 'Текст принят. Шаг 3 из 3: пришлите фото или нажмите «Без фото».', {
      reply_markup: kbPhoto(),
    });
  }

  return reply(ctx, 'Сейчас жду действие кнопкой. /start — начать заново.');
}

// Готовим предпросмотр (для прогноза — через ИИ) и показываем кнопки публикации.
async function toPreview(ctx, st) {
  st.step = 'preview';
  if (st.type === 'forecast') {
    let prepared;
    let note = '';
    try {
      prepared = aiEnabled()
        ? await prepareForecast(st.rawText)
        : prepareForecastFallback(st.rawText);
    } catch (e) {
      logger.error(`ИИ-выжимка не удалась: ${e.message}`);
      prepared = prepareForecastFallback(st.rawText);
      note = '\n(ИИ недоступен — показана грубая выжимка)';
    }
    prepared.title = 'Прогноз от Геннадия Серафимовича';
    st.prepared = prepared;

    const lines = [
      'Предпросмотр прогноза дня:',
      prepared.subtitle ? `\n${prepared.subtitle}` : '',
      prepared.intro ? `\n${prepared.intro}` : '',
      '',
      prepared.water ? `Вода дня: ${prepared.water}` : '',
      prepared.color ? `Цвет дня: ${prepared.color}` : '',
      prepared.food ? `Еда дня: ${prepared.food}` : '',
      prepared.advice ? `Совет дня: ${prepared.advice}` : '',
      '',
      `Фото: ${st.photoFileId ? 'есть' : 'нет'}`,
      note,
    ].filter((l) => l !== '');
    return reply(ctx, lines.join('\n'), { reply_markup: kbPublish() });
  }

  // Статья: заголовок и тело собраны на отдельных шагах.
  const title = (st.title || '').trim();
  const body = (st.body || '').trim();
  const excerpt = (body.split(/\n\s*\n/)[0] || body).slice(0, 180).trim();
  st.prepared = { title, excerpt, body };

  const lines = [
    'Предпросмотр статьи:',
    `\nЗаголовок: ${title}`,
    excerpt ? `Анонс: ${excerpt}` : '',
    `\nФото: ${st.photoFileId ? 'есть' : 'нет'}`,
  ].filter((l) => l !== '');
  return reply(ctx, lines.join('\n'), { reply_markup: kbPublish() });
}

bot.catch((err) => {
  logger.error(`Необработанная ошибка бота: ${err.error?.message || err.message}`);
});

bot.start({
  onStart: (info) => logger.info(`Бот @${info.username} запущен (long-polling).`),
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, () => {
    logger.info('Останавливаю бота…');
    bot.stop();
  });
}
