import 'dotenv/config';

const num = (v, def) => (v != null && v !== '' ? Number(v) : def);

export const config = {
  port: num(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './data/app.db',

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
};

export const isProd = config.env === 'production';
