// Запись контента из бота в SQLite: прогноз дня (upsert по дате) и статьи блога.
import { db } from '../lib/db.js';
import { uniqueSlug } from '../lib/slug.js';

const findForecastByDate = db.prepare('SELECT id FROM forecast WHERE date = ?');
const insertForecast = db.prepare(
  'INSERT INTO forecast (date, title, summary, body, image_url) VALUES (?, ?, ?, ?, ?)'
);
const updateForecast = db.prepare(
  'UPDATE forecast SET title = ?, summary = ?, body = ?, image_url = COALESCE(?, image_url) WHERE id = ?'
);

const postSlugExists = db.prepare('SELECT 1 FROM posts WHERE slug = ?');
const insertPost = db.prepare(
  'INSERT INTO posts (slug, title, excerpt, body, image_url) VALUES (?, ?, ?, ?, ?)'
);

// Создаёт или обновляет прогноз на сегодня. Если imageUrl не передан при
// обновлении — прежнее фото сохраняется (COALESCE).
export function upsertForecast({ title, summary, body, imageUrl }) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const existing = findForecastByDate.get(date);
  if (existing) {
    updateForecast.run(title, summary, body, imageUrl ?? null, existing.id);
    return { id: existing.id, date, updated: true };
  }
  const info = insertForecast.run(date, title, summary, body, imageUrl ?? null);
  return { id: Number(info.lastInsertRowid), date, updated: false };
}

// Создаёт статью блога с уникальным slug.
export function createPost({ title, excerpt, body, imageUrl }) {
  const slug = uniqueSlug(title, (s) => !!postSlugExists.get(s));
  const info = insertPost.run(slug, title, excerpt, body, imageUrl ?? null);
  return { id: Number(info.lastInsertRowid), slug };
}
