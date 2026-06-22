import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

// Используем встроенный в Node sqlite — нулевые нативные зависимости,
// максимально лёгкий вариант под сервер 2 ядра / 2 ГБ.
mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS forecast (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,            -- YYYY-MM-DD
    title       TEXT,                     -- "Прогноз от Геннадия Серафимовича"
    summary     TEXT,                     -- короткая выжимка для блока
    body        TEXT NOT NULL,            -- полный текст
    image_url   TEXT,                     -- CDN-URL фото
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_forecast_date ON forecast(date DESC);

  CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT UNIQUE NOT NULL,
    title       TEXT NOT NULL,
    excerpt     TEXT,
    body        TEXT NOT NULL,
    image_url   TEXT,
    published   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
`);

// Миграция: структурированные поля прогноза (выжимка от ИИ). Добавляем
// недостающие колонки в существующую таблицу forecast — безопасно и идемпотентно.
const forecastCols = new Set(
  db.prepare('PRAGMA table_info(forecast)').all().map((c) => c.name)
);
const EXTRA_FORECAST_COLS = {
  subtitle: 'TEXT', // "28-й Солнечный день, 1/2 Лунные дни"
  intro: 'TEXT', // вводный абзац для свёрнутого блока
  water: 'TEXT', // Вода дня
  color: 'TEXT', // Цвет дня
  food: 'TEXT', // Еда дня
  advice: 'TEXT', // Совет дня
};
for (const [name, type] of Object.entries(EXTRA_FORECAST_COLS)) {
  if (!forecastCols.has(name)) {
    db.exec(`ALTER TABLE forecast ADD COLUMN ${name} ${type};`);
  }
}

// ---------- Треки эфира (майлстоун 3) ----------
// Фонотека переехала из файла public/assets/tracks.json в БД, чтобы ей можно было
// управлять через бота (добавлять/удалять) без передеплоя. position задаёт порядок,
// s3_key хранится для удаления объекта в S3.
db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    position    INTEGER NOT NULL DEFAULT 0,
    title       TEXT NOT NULL,
    artist      TEXT,
    s3_key      TEXT,                     -- ключ объекта в S3 (для удаления)
    url         TEXT NOT NULL,            -- публичный CDN-URL
    cover       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tracks_position ON tracks(position, id);
`);

// Сид: при пустой таблице переносим текущие треки из public/assets/tracks.json
// (одноразово; дальше источник правды — БД, файл больше не редактируется).
const tracksSeeded = db.prepare('SELECT COUNT(*) AS n FROM tracks').get().n;
if (tracksSeeded === 0) {
  try {
    const manifest = join(
      dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'assets', 'tracks.json'
    );
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : parsed.tracks || [];
      const insTrack = db.prepare(
        'INSERT INTO tracks (position, title, artist, s3_key, url, cover) VALUES (?, ?, ?, ?, ?, ?)'
      );
      list.forEach((t, i) => {
        if (!t || !t.url) return;
        let key = '';
        try { key = new URL(t.url).pathname.replace(/^\/+/, ''); } catch { key = ''; }
        insTrack.run(
          i + 1,
          t.title || 'Радио Толкай Вода',
          t.artist || 'Клан Толкай Вода',
          key,
          t.url,
          t.cover || '/assets/img/cover-default.webp'
        );
      });
    }
  } catch {
    // манифест недоступен/битый → таблица пустая; сайт и эфир отработают штатно
  }
}
