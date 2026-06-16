// Запись контента из бота в SQLite: прогноз дня (upsert по дате) и статьи блога.
import { db } from '../lib/db.js';
import { uniqueSlug } from '../lib/slug.js';

const findForecastByDate = db.prepare('SELECT id FROM forecast WHERE date = ?');
// Позиционные параметры (?) — node:sqlite надёжно работает с ними,
// в отличие от именованных (@name).
const insertForecast = db.prepare(
  `INSERT INTO forecast (date, title, summary, body, image_url, subtitle, intro, water, color, food, advice)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const updateForecast = db.prepare(
  `UPDATE forecast SET
     title = ?, summary = ?, body = ?,
     image_url = COALESCE(?, image_url),
     subtitle = ?, intro = ?, water = ?, color = ?, food = ?, advice = ?
   WHERE id = ?`
);

const postSlugExists = db.prepare('SELECT 1 FROM posts WHERE slug = ?');
const insertPost = db.prepare(
  'INSERT INTO posts (slug, title, excerpt, body, image_url) VALUES (?, ?, ?, ?, ?)'
);

const FORECAST_TITLE = 'Прогноз от Геннадия Серафимовича';

// Создаёт или обновляет прогноз на сегодня. Принимает структуру из ai.prepareForecast.
// summary хранит intro (короткий текст для свёрнутого блока), body — полный текст.
export function upsertForecast(f) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const row = {
    date,
    title: f.title || FORECAST_TITLE,
    summary: f.intro || '',
    body: f.full || '',
    image_url: f.imageUrl ?? null,
    subtitle: f.subtitle || '',
    intro: f.intro || '',
    water: f.water || '',
    color: f.color || '',
    food: f.food || '',
    advice: f.advice || '',
  };

  const existing = findForecastByDate.get(date);
  if (existing) {
    updateForecast.run(
      row.title, row.summary, row.body, row.image_url,
      row.subtitle, row.intro, row.water, row.color, row.food, row.advice,
      existing.id
    );
    return { id: existing.id, date, updated: true };
  }
  const info = insertForecast.run(
    row.date, row.title, row.summary, row.body, row.image_url,
    row.subtitle, row.intro, row.water, row.color, row.food, row.advice
  );
  return { id: Number(info.lastInsertRowid), date, updated: false };
}

// Создаёт статью блога с уникальным slug.
export function createPost({ title, excerpt, body, imageUrl }) {
  const slug = uniqueSlug(title, (s) => !!postSlugExists.get(s));
  const info = insertPost.run(slug, title, excerpt, body, imageUrl ?? null);
  return { id: Number(info.lastInsertRowid), slug };
}
