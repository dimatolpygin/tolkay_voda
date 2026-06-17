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

// ---------- Редактирование (этап 10) ----------

const recentForecastsStmt = db.prepare(
  'SELECT id, date, title, subtitle FROM forecast ORDER BY date DESC, id DESC LIMIT ?'
);
const recentPostsStmt = db.prepare(
  'SELECT id, slug, title, created_at FROM posts ORDER BY created_at DESC, id DESC LIMIT ?'
);
const forecastByIdStmt = db.prepare('SELECT * FROM forecast WHERE id = ?');
const postByIdStmt = db.prepare('SELECT * FROM posts WHERE id = ?');
const deleteForecastStmt = db.prepare('DELETE FROM forecast WHERE id = ?');
const deletePostStmt = db.prepare('DELETE FROM posts WHERE id = ?');
const reprocessForecastStmt = db.prepare(
  `UPDATE forecast SET summary = ?, body = ?, subtitle = ?, intro = ?,
     water = ?, color = ?, food = ?, advice = ? WHERE id = ?`
);

// Белые списки колонок — имена подставляются в SQL, поэтому только из набора.
const FORECAST_FIELDS = new Set(['intro', 'water', 'color', 'food', 'advice', 'subtitle', 'image_url']);
const POST_FIELDS = new Set(['title', 'body', 'image_url']);

export function listRecentForecasts(limit = 10) {
  return recentForecastsStmt.all(limit);
}
export function listRecentPosts(limit = 10) {
  return recentPostsStmt.all(limit);
}
export function getForecast(id) {
  return forecastByIdStmt.get(Number(id));
}
export function getPost(id) {
  return postByIdStmt.get(Number(id));
}
export function deleteForecast(id) {
  return deleteForecastStmt.run(Number(id)).changes;
}
export function deletePost(id) {
  return deletePostStmt.run(Number(id)).changes;
}

// Точечное обновление одного поля прогноза. summary дублирует intro (свёрнутый блок).
export function updateForecastField(id, field, value) {
  if (!FORECAST_FIELDS.has(field)) throw new Error(`Недопустимое поле прогноза: ${field}`);
  db.prepare(`UPDATE forecast SET ${field} = ? WHERE id = ?`).run(value, Number(id));
  if (field === 'intro') {
    db.prepare('UPDATE forecast SET summary = ? WHERE id = ?').run(value, Number(id));
  }
}

// Точечное обновление одного поля статьи. При правке body пересобираем excerpt.
export function updatePostField(id, field, value) {
  if (!POST_FIELDS.has(field)) throw new Error(`Недопустимое поле статьи: ${field}`);
  if (field === 'body') {
    const excerpt = (String(value).split(/\n\s*\n/)[0] || value).slice(0, 180).trim();
    db.prepare('UPDATE posts SET body = ?, excerpt = ? WHERE id = ?').run(value, excerpt, Number(id));
    return;
  }
  db.prepare(`UPDATE posts SET ${field} = ? WHERE id = ?`).run(value, Number(id));
}

// Полная переработка прогноза из нового сырого текста (структура из ai.prepareForecast).
export function reprocessForecast(id, prepared) {
  reprocessForecastStmt.run(
    prepared.intro || '',
    prepared.full || '',
    prepared.subtitle || '',
    prepared.intro || '',
    prepared.water || '',
    prepared.color || '',
    prepared.food || '',
    prepared.advice || '',
    Number(id)
  );
}
