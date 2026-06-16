// Telegram-бот контента: пошаговый сценарий (FSM) с инлайн-кнопками.
// Прогноз дня проходит через ИИ-выжимку (OpenAI). Доступ — только whitelist.
import { Bot, InlineKeyboard } from 'grammy';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { upsertForecast, createPost } from './store.js';
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
    .text('Статья в блог', 'type:post');
const kbPhoto = () =>
  new InlineKeyboard().text('Без фото', 'photo:skip').text('Отмена', 'cancel');
const kbPublish = () =>
  new InlineKeyboard().text('Опубликовать', 'publish').text('Отмена', 'cancel');

const HELP = [
  'Бот клана «Толкай Вода». Публикую контент на сайте.',
  '',
  'Нажмите /start и выберите, что добавить: прогноз дня или статью в блог.',
  'Дальше я проведу по шагам: текст → фото → предпросмотр → публикация.',
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
  setState(who(ctx).id, { type: 'post', step: 'await_text' });
  await reply(
    ctx,
    'Статья в блог. Пришлите текст: первая строка — заголовок, дальше — текст статьи (можно сразу с фото).'
  );
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

// --- Приём текста и фото в зависимости от шага ---
bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const st = getState(who(ctx).id);
  if (!st) return reply(ctx, 'Нажмите /start и выберите тип контента.', { reply_markup: kbType() });
  if (st.step === 'await_text') return onText(ctx, st, ctx.message.text, null);
  return reply(ctx, 'Сейчас жду действие кнопкой. /start — начать заново.');
});

bot.on(':photo', async (ctx) => {
  const st = getState(who(ctx).id);
  const ph = largestPhoto(ctx.message.photo);
  const caption = ctx.message.caption || '';
  if (!st) return reply(ctx, 'Нажмите /start и выберите тип контента.', { reply_markup: kbType() });
  if (st.step === 'await_text') return onText(ctx, st, caption, ph?.file_id || null);
  if (st.step === 'await_photo') {
    st.photoFileId = ph?.file_id || null;
    return toPreview(ctx, st);
  }
  return reply(ctx, 'Сейчас жду действие кнопкой. /start — начать заново.');
});

// Текст получен на шаге await_text.
async function onText(ctx, st, text, photoFileId) {
  const trimmed = (text || '').trim();
  if (!trimmed) return reply(ctx, 'Пустой текст. Пришлите содержимое ещё раз.');
  st.rawText = trimmed;
  if (photoFileId) {
    st.photoFileId = photoFileId;
    return toPreview(ctx, st); // текст и фото пришли сразу
  }
  st.step = 'await_photo';
  return reply(ctx, 'Принял текст. Пришлите фото для записи или нажмите «Без фото».', {
    reply_markup: kbPhoto(),
  });
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

  // Статья: первая строка — заголовок, остальное — тело.
  const ls = st.rawText.replace(/\r\n/g, '\n').split('\n');
  const title = (ls.shift() || '').trim();
  const body = ls.join('\n').trim();
  if (!title) {
    st.step = 'await_text';
    return reply(ctx, 'Нет заголовка. Первая строка должна быть заголовком. Пришлите текст ещё раз.');
  }
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
