// Рекламные баннеры под плеером (этап 16): чтение и запись двух фиксированных слотов.
// Источник правды для GET /api/ads и для панели управления (этап 17).
//
// Слот без строки в таблице считается пустым — на сайте он просто не рисуется.
// Ссылки пропускаем только по схемам http/https: баннеры ведут на внешние сайты,
// и это единственное место в проекте, где чужой URL попадает в атрибут href.
import { db } from './db.js';

// Ровно два места, без ротации и пула рекламодателей — решение клиента.
export const AD_SLOTS = [1, 2];

const listStmt = db.prepare(
  'SELECT slot, image_key, image_url, link_url, button_text, updated_at FROM ads ORDER BY slot ASC'
);
const bySlotStmt = db.prepare(
  'SELECT slot, image_key, image_url, link_url, button_text, updated_at FROM ads WHERE slot = ?'
);
const upsertStmt = db.prepare(`
  INSERT INTO ads (slot, image_key, image_url, link_url, button_text, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(slot) DO UPDATE SET
    image_key   = excluded.image_key,
    image_url   = excluded.image_url,
    link_url    = excluded.link_url,
    button_text = excluded.button_text,
    updated_at  = excluded.updated_at
`);
const deleteStmt = db.prepare('DELETE FROM ads WHERE slot = ?');

// Ошибка валидации с машинным кодом — панель этапа 17 покажет по нему текст поля.
export class AdValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AdValidationError';
    this.code = code;
  }
}

// Только http/https. Исключает javascript:, data: и прочие схемы в href.
export function isValidLink(value) {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const { protocol } = new URL(value.trim());
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeSlot(value) {
  const slot = Number(value);
  return AD_SLOTS.includes(slot) ? slot : null;
}

// Строка из БД → форма для фронта. null, если строка непригодна к показу:
// база правится и руками (до появления панели), кривой слот на сайт пускать нельзя.
function toPublic(row) {
  if (!row) return null;
  const slot = normalizeSlot(row.slot);
  if (!slot) return null;
  if (!isValidLink(row.image_url) || !isValidLink(row.link_url)) return null;
  return {
    slot,
    imageUrl: row.image_url,
    linkUrl: row.link_url,
    buttonText: row.button_text || '',
  };
}

// Заполненные слоты, пригодные к показу, по возрастанию слота.
export function listAds() {
  return listStmt.all().map(toPublic).filter(Boolean);
}

// Сырая строка слота (для панели — ей нужен и image_key, и непрошедшая валидацию запись).
export function getAdRaw(slot) {
  const s = normalizeSlot(slot);
  return s ? bySlotStmt.get(s) ?? null : null;
}

// Ставит или заменяет баннер в слоте. Бросает AdValidationError на кривых данных.
export function setAd({ slot, imageKey, imageUrl, linkUrl, buttonText }) {
  const s = normalizeSlot(slot);
  if (!s) throw new AdValidationError('bad_slot', 'Слот баннера должен быть 1 или 2');
  if (!isValidLink(imageUrl)) {
    throw new AdValidationError('bad_image_url', 'Ссылка на картинку должна быть http или https');
  }
  if (!isValidLink(linkUrl)) {
    throw new AdValidationError('bad_link_url', 'Ссылка баннера должна быть http или https');
  }
  const text = typeof buttonText === 'string' ? buttonText.trim().slice(0, 40) : '';
  upsertStmt.run(s, imageKey ?? '', imageUrl.trim(), linkUrl.trim(), text);
  return getAdRaw(s);
}

// Снимает баннер со слота. Возвращает число удалённых строк (0, если слот был пуст).
export function clearAd(slot) {
  const s = normalizeSlot(slot);
  if (!s) throw new AdValidationError('bad_slot', 'Слот баннера должен быть 1 или 2');
  return deleteStmt.run(s).changes;
}
