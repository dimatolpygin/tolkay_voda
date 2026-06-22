// Фото из Telegram → S3 Beget → публичный CDN-URL.
import { randomUUID } from 'node:crypto';
import { config } from '../lib/config.js';
import { uploadObject } from '../lib/s3.js';

// Telegram отдаёт массив размеров; берём самый крупный (последний).
export function largestPhoto(photos) {
  if (!Array.isArray(photos) || !photos.length) return null;
  return photos[photos.length - 1];
}

// Скачивает файл Telegram по file_id и заливает в бакет под префиксом
// (`forecast` | `blog`). Возвращает CDN-URL или бросает ошибку.
export async function uploadTelegramPhoto(api, fileId, prefix) {
  const file = await api.getFile(fileId); // { file_path, ... }
  if (!file.file_path) throw new Error('Telegram не вернул file_path');

  const url = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Скачивание из Telegram: HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (file.file_path.split('.').pop() || 'jpg').toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const key = `${prefix}/${randomUUID()}.${ext}`;

  return uploadObject(key, buf, contentType);
}

// Скачивает аудио Telegram по file_id и заливает в бакет под ключом
// `audio/<keyBase>.mp3` (keyBase — ASCII-слаг с номером позиции).
// Возвращает { url, key }. Лимит скачивания через Bot API — 20 МБ.
export async function uploadTelegramAudio(api, fileId, keyBase) {
  const file = await api.getFile(fileId);
  if (!file.file_path) throw new Error('Telegram не вернул file_path');

  const url = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Скачивание из Telegram: HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const key = `audio/${keyBase}.mp3`;
  const cdn = await uploadObject(key, buf, 'audio/mpeg');
  return { url: cdn, key };
}
