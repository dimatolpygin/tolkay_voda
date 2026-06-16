import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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
