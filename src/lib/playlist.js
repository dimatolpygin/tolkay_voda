// Генерация плейлиста Liquidsoap из БД.
// В ICY-метаданные уходит ASCII-слаг имени файла (русское название резолвится
// на бэке в /api/stream/now). Liquidsoap перечитывает файл по reload_mode="watch",
// поэтому изменения фонотеки попадают в эфир без рестарта.
//
// ВРЕМЕННОЕ РЕШЕНИЕ (2026-06-24): треки берутся из ЛОКАЛЬНОГО кэша на диске
// (audio-cache), а не с CDN Beget — CDN периодически отдаёт 523 и эфир немеет.
// В плейлист пишем локальный путь, если файл уже в кэше; иначе — CDN-URL как
// подстраховку (mksafe всё равно переживёт недоступный трек). По мере наполнения
// кэша все строки становятся локальными. Подробнее: src/lib/audio-cache.js.
import { writeFileSync } from 'node:fs';
import { config } from './config.js';
import { listTracks } from './tracks-store.js';
import { syncAudioCache, localPathFor, isCached } from './audio-cache.js';

const esc = (s) => String(s || '').replace(/"/g, '\\"');

// slug = имя файла из URL без расширения: .../audio/47-carstvo-....mp3 → 47-carstvo-...
const slugFromUrl = (url) => {
  const base = String(url || '').split('/').pop() || '';
  return base.replace(/\.[^.]+$/, '');
};

// Источник аудио для трека: локальный файл, если он в кэше, иначе CDN-URL.
const sourceFor = (t) => (isCached(t) ? localPathFor(t) : t.url);

// Синхронная запись playlist.m3u из текущей фонотеки БД (без скачивания).
// Возвращает число записанных треков.
export function writePlaylist() {
  const tracks = listTracks().filter((t) => t && t.url);
  const header = '# Плейлист эфира Liquidsoap — сгенерирован из БД (src/lib/playlist.js).\n';
  const lines = tracks.map((t) => `annotate:title="${esc(slugFromUrl(t.url))}":${sourceFor(t)}`);
  writeFileSync(config.playlistPath, header + lines.join('\n') + '\n', 'utf8');
  return tracks.length;
}

// Полная пересборка: докачать недостающие треки в локальный кэш, затем записать
// плейлист с локальными путями. Используется ботом при добавлении/удалении песни.
export async function regeneratePlaylist() {
  const tracks = listTracks().filter((t) => t && t.url);
  await syncAudioCache(tracks);
  return writePlaylist();
}
