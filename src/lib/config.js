import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const num = (v, def) => (v != null && v !== '' ? Number(v) : def);

const __dirname = dirname(fileURLToPath(import.meta.url));

export const config = {
  port: num(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './data/app.db',

  // Куда писать плейлист для Liquidsoap. В контейнерах — общий том /playlist
  // (см. docker-compose, env PLAYLIST_PATH); локально — файл в репозитории.
  playlistPath:
    process.env.PLAYLIST_PATH ||
    join(__dirname, '..', '..', 'docker', 'liquidsoap', 'playlist.m3u'),

  // ВРЕМЕННОЕ РЕШЕНИЕ (2026-06-24): локальный кэш mp3 эфира на диске сервера.
  // Liquidsoap играет с диска, а не тянет с CDN Beget на лету — CDN периодически
  // отдаёт 523 и эфир немеет. В контейнерах — общий том /audio (env AUDIO_CACHE_DIR),
  // локально — папка в data. Подробнее: CLAUDE.md → «Временное: локальный кэш эфира».
  audioCacheDir: process.env.AUDIO_CACHE_DIR || join(__dirname, '..', '..', 'data', 'audio'),

  s3: {
    region: process.env.S3_REGION || 'ru-central-1',
    endpoint: process.env.S3_ENDPOINT || 'https://s3.ru1.storage.beget.cloud',
    bucket: process.env.S3_BUCKET || '',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
    cdnBaseUrl: (process.env.CDN_BASE_URL || '').replace(/\/+$/, ''),
  },

  bot: {
    token: process.env.BOT_TOKEN || '',
    adminIds: (process.env.BOT_ADMIN_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number),
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
  },
};

export const isProd = config.env === 'production';
