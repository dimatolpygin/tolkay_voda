// Telegram-бот контента: наполняет прогноз дня и блог из личных сообщений.
// Long-polling, grammY. Доступ только у whitelist (BOT_ADMIN_IDS).
import { Bot } from 'grammy';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { isForecast, parseForecast, parsePost } from './parse.js';
import { upsertForecast, createPost } from './store.js';
import { largestPhoto, uploadTelegramPhoto } from './media.js';

if (!config.bot.token) {
  logger.error('BOT_TOKEN не задан в .env — бот не запущен.');
  process.exit(1);
}
if (!config.bot.adminIds.length) {
  logger.warn('BOT_ADMIN_IDS пуст — постить контент не сможет никто. Заполните .env.');
}

const HELP = [
  'Бот клана «Толкай Вода». Я публикую контент на сайте.',
  '',
  'Прогноз дня — пришлите сообщение (можно с фото), где первая строка начинается со слова «Прогноз»:',
  '  Прогноз дня',
  '  28-й Солнечный день…',
  '  <текст прогноза>',
  '',
  'Статья блога — пришлите сообщение (можно с фото), где первая строка — заголовок:',
  '  Слава моржам',
  '  <текст статьи>',
  '',
  'Фото можно прикреплять к любому сообщению — оно попадёт на сайт.',
].join('\n');

const bot = new Bot(config.bot.token);

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

async function replyLog(ctx, text) {
  await ctx.reply(text);
  const u = who(ctx);
  logger.info(`Бот -> @${u.username}: ${preview(text)}`);
}

// --- Логирование каждого входящего сообщения ---
bot.use(async (ctx, next) => {
  const u = who(ctx);
  const text =
    ctx.message?.text ||
    ctx.message?.caption ||
    (ctx.message?.photo ? '(фото)' : '(служебное)');
  logger.info(`Вход @${u.username} (id:${u.id}, ${u.name}) -> ${preview(text)}`);
  await next();
});

// --- Whitelist: чужие сообщения игнорируем молча ---
bot.use(async (ctx, next) => {
  const u = who(ctx);
  if (!config.bot.adminIds.includes(u.id)) {
    logger.warn(`Отказ: @${u.username} (id:${u.id}) не в whitelist — игнор.`);
    return;
  }
  await next();
});

// --- Команды ---
bot.command(['start', 'help'], (ctx) => replyLog(ctx, HELP));

// --- Контент с фото (берём подпись как текст) ---
bot.on(':photo', (ctx) => handle(ctx, ctx.message.caption || '', ctx.message.photo));

// --- Текстовые сообщения (кроме команд) ---
bot.on('message:text', (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  return handle(ctx, ctx.message.text, null);
});

async function handle(ctx, rawText, photos) {
  const text = (rawText || '').trim();
  if (!text) {
    return replyLog(
      ctx,
      'Нужен текст. Для прогноза начните с «Прогноз», для статьи первая строка — заголовок. /help'
    );
  }
  try {
    if (isForecast(text)) await handleForecast(ctx, text, photos);
    else await handlePost(ctx, text, photos);
  } catch (e) {
    logger.error(`Ошибка обработки: ${e.message}`);
    await replyLog(ctx, 'Не удалось сохранить. Попробуйте ещё раз чуть позже.');
  }
}

async function handleForecast(ctx, text, photos) {
  const { title, summary, body } = parseForecast(text);
  if (!body) {
    return replyLog(
      ctx,
      'Пустой прогноз. Формат: первая строка «Прогноз дня», со второй — текст.'
    );
  }
  let imageUrl = null;
  const ph = largestPhoto(photos);
  if (ph) imageUrl = await uploadTelegramPhoto(ctx.api, ph.file_id, 'forecast');

  const r = upsertForecast({ title, summary, body, imageUrl });
  logger.info(`Прогноз ${r.updated ? 'обновлён' : 'создан'} (id ${r.id}, дата ${r.date}).`);
  await replyLog(
    ctx,
    `Прогноз дня ${r.updated ? 'обновлён' : 'опубликован'} на сайте. Дата: ${fmtDate(r.date)}.`
  );
}

async function handlePost(ctx, text, photos) {
  const { title, excerpt, body } = parsePost(text);
  if (!title) {
    return replyLog(ctx, 'Нет заголовка. Первая строка — заголовок статьи, дальше — текст.');
  }
  let imageUrl = null;
  const ph = largestPhoto(photos);
  if (ph) imageUrl = await uploadTelegramPhoto(ctx.api, ph.file_id, 'blog');

  const r = createPost({ title, excerpt, body, imageUrl });
  logger.info(`Статья создана (id ${r.id}, slug ${r.slug}).`);
  await replyLog(ctx, `Статья опубликована: «${title}». Открыть: /post.html?slug=${r.slug}`);
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
