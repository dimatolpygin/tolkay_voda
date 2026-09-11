// Файлы из формы панели → S3 Beget → публичный CDN-URL.
// Телеграмный аналог (src/bot/media.js) качает файл у Bot API и упирается в его
// лимит 20 МБ; здесь байты приходят прямо из браузера, поэтому потолок ставим свой.
import { randomUUID } from 'node:crypto';
import { uploadObject } from './s3.js';
import { slugify } from './slug.js';

// Картинки: обложки прогноза, статьи и баннеры.
export const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

export class MediaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MediaError';
  }
}

const extOf = (name) => String(name || '').split('.').pop()?.toLowerCase() || '';

// Тип определяем по mime от браузера, а если он невнятный (some Android шлют
// application/octet-stream) — по расширению имени файла.
function imageExt(file) {
  const byMime = IMAGE_TYPES.get(String(file.mimetype || '').toLowerCase());
  if (byMime) return byMime;
  const e = extOf(file.filename);
  if (e === 'jpg' || e === 'jpeg') return 'jpg';
  if (e === 'png') return 'png';
  if (e === 'webp') return 'webp';
  return null;
}

const mimeForExt = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Заливает картинку под префиксом (`forecast` | `blog` | `ads`).
// Возвращает { url, key } — key нужен, чтобы потом заменить или удалить объект.
export async function uploadImage(file, prefix) {
  if (!file?.buffer?.length) throw new MediaError('Файл картинки пустой');
  if (file.buffer.length > MAX_IMAGE_BYTES) {
    throw new MediaError('Картинка больше 8 МБ — уменьшите файл');
  }
  const ext = imageExt(file);
  if (!ext) throw new MediaError('Картинка должна быть JPG, PNG или WEBP');

  const key = `${prefix}/${randomUUID()}.${ext}`;
  const url = await uploadObject(key, file.buffer, mimeForExt[ext]);
  return { url, key };
}

// Заливает mp3 под ключом `audio/<позиция>-<слаг названия>.mp3`.
// Имя ключа держим ASCII: оно же уходит в ICY-метаданные эфира (см. playlist.js).
export async function uploadAudio(file, position, title) {
  if (!file?.buffer?.length) throw new MediaError('Файл песни пустой');
  if (file.buffer.length > MAX_AUDIO_BYTES) {
    throw new MediaError('Файл больше 50 МБ — сожмите mp3');
  }
  const mime = String(file.mimetype || '').toLowerCase();
  const ext = extOf(file.filename);
  if (!mime.startsWith('audio/') && ext !== 'mp3') {
    throw new MediaError('Это не аудио — нужен файл mp3');
  }

  const key = `audio/${String(position).padStart(2, '0')}-${slugify(title)}.mp3`;
  const url = await uploadObject(key, file.buffer, 'audio/mpeg');
  return { url, key };
}
