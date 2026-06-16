import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import './lib/db.js'; // инициализация БД при старте

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const app = Fastify({ loggerInstance: logger, trustProxy: true });

// API-маршруты
import healthRoutes from './routes/health.js';
import tracksRoutes from './routes/tracks.js';
import forecastRoutes from './routes/forecast.js';
import postsRoutes from './routes/posts.js';

await app.register(healthRoutes, { prefix: '/api' });
await app.register(tracksRoutes, { prefix: '/api' });
await app.register(forecastRoutes, { prefix: '/api' });
await app.register(postsRoutes, { prefix: '/api' });

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
