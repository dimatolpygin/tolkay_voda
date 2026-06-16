import { readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUD_RE = /^AUD[-_]\d+/i;

// Превращает имя файла в читаемое название трека
export function titleFromFilename(file) {
  let name = basename(file, extname(file));
  if (UUID_RE.test(name) || AUD_RE.test(name)) {
    return 'Радио Толкай Вода';
  }
  name = name
    .replace(/_/g, ' ')
    .replace(/«|»|"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[\s.,;:—-]+$/u, '')
    .trim();
  // капитализация первой буквы
  if (name.length) name = name[0].toUpperCase() + name.slice(1);
  return name || 'Радио Толкай Вода';
}

// Транслитерация в ASCII-slug для безопасного ключа файла/URL
const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(str) {
  return str
    .toLowerCase()
    .split('')
    .map((ch) => (MAP[ch] != null ? MAP[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'track';
}

// Список mp3 в каталоге (рекурсивно — на случай вложенной папки из zip)
export function listMp3(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listMp3(full));
    else if (extname(entry).toLowerCase() === '.mp3') out.push(full);
  }
  return out;
}

// Строит список треков с уникальными ключами и названиями
export function buildTrackList(dir) {
  const files = listMp3(dir).sort();
  const used = new Set();
  return files.map((file, i) => {
    const title = titleFromFilename(file);
    let key = slugify(title);
    if (used.has(key)) key = `${key}-${i + 1}`;
    used.add(key);
    return { file, title, key: `${String(i + 1).padStart(2, '0')}-${key}` };
  });
}
