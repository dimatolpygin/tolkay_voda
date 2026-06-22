// Генерация плейлиста Liquidsoap из БД.
// В ICY-метаданные уходит ASCII-слаг имени файла (русское название резолвится
// на бэке в /api/stream/now). Liquidsoap перечитывает файл по reload_mode="watch",
// поэтому изменения фонотеки попадают в эфир без рестарта.
import { writeFileSync } from 'node:fs';
import { config } from './config.js';
import { listTracks } from './tracks-store.js';

const esc = (s) => String(s || '').replace(/"/g, '\\"');

// slug = имя файла из URL без расширения: .../audio/47-carstvo-....mp3 → 47-carstvo-...
const slugFromUrl = (url) => {
  const base = String(url || '').split('/').pop() || '';
  return base.replace(/\.[^.]+$/, '');
};

// Перезаписывает playlist.m3u (config.playlistPath) из текущей фонотеки БД.
// Возвращает число записанных треков.
export function regeneratePlaylist() {
  const tracks = listTracks().filter((t) => t && t.url);
  const header = '# Плейлист эфира Liquidsoap — сгенерирован из БД (src/lib/playlist.js).\n';
  const lines = tracks.map((t) => `annotate:title="${esc(slugFromUrl(t.url))}":${t.url}`);
  writeFileSync(config.playlistPath, header + lines.join('\n') + '\n', 'utf8');
  return tracks.length;
}
