import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCompress from '@fastify/compress';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import './lib/db.js'; // инициализация БД при старте
import { writePlaylist, regeneratePlaylist } from './lib/playlist.js';

// Плейлист эфира строим из БД при старте — заполняем общий том /playlist,
// который читает Liquidsoap (reload_mode="watch"). Не валим старт, если не вышло.
// Сначала пишем плейлист сразу (локальные файлы там, где уже есть в кэше, иначе
// CDN-URL) — чтобы эфир стартовал без ожидания. Затем в ФОНЕ докачиваем кэш из S3
// и переписываем плейлист на локальные пути (Liquidsoap перечитает по watch).
// Так деплой не блокируется на ~170 МБ загрузки. См. src/lib/audio-cache.js.
try {
  const n = writePlaylist();
  logger.info(`Плейлист эфира собран из БД: ${n} треков → ${config.playlistPath}`);
} catch (err) {
  logger.error({ err }, 'Не удалось собрать плейлист эфира при старте');
}
regeneratePlaylist()
  .then(() => logger.info('Локальный кэш эфира синхронизирован, плейлист обновлён.'))
  .catch((err) => logger.error({ err }, 'Фоновая синхронизация кэша эфира не удалась'));

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const app = Fastify({ loggerInstance: logger, trustProxy: true });

// Сжатие ответов (br/gzip) — HTML/CSS/JS/JSON. Бинарные ассеты (webp/woff2/mp3)
// уже сжаты, их пропускаем по mime-типу автоматически.
await app.register(fastifyCompress, { global: true, encodings: ['br', 'gzip'], threshold: 1024 });

// API-маршруты
import healthRoutes from './routes/health.js';
import tracksRoutes from './routes/tracks.js';
import forecastRoutes from './routes/forecast.js';
import postsRoutes from './routes/posts.js';
import streamRoutes from './routes/stream.js';
import seoRoutes from './routes/seo.js';

await app.register(healthRoutes, { prefix: '/api' });
await app.register(tracksRoutes, { prefix: '/api' });
await app.register(forecastRoutes, { prefix: '/api' });
await app.register(postsRoutes, { prefix: '/api' });
await app.register(streamRoutes, { prefix: '/api' });

// SEO-маршруты корня (sitemap.xml, ЧПУ /blog/:slug) — до статики.
await app.register(seoRoutes);

// Статика (фронт)
await app.register(fastifyStatic, {
  root: publicDir,
  prefix: '/',
});

// SPA-friendly: блог-статья и т.п. отдаём index, 404 для /api
app.setNotFoundHandler((req, reply) => {
  if (req.raw.url?.startsWith('/api')) {
    return reply.code(404).send({ ok: false, error: 'not_found' });
  }
  return reply.sendFile('index.html');
});

try {
  await app.listen({ port: config.port, host: config.host });
  logger.info(`Сервер запущен → http://${config.host}:${config.port}`);
} catch (err) {
  logger.error(err);
  process.exit(1);
}
