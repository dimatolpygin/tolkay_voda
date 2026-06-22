// Генерирует плейлист для Liquidsoap из БД (фонотека, таблица tracks).
// Путь вывода — config.playlistPath (по умолчанию docker/liquidsoap/playlist.m3u,
// в контейнерах переопределяется env PLAYLIST_PATH на общий том /playlist).
//
// В ICY уходит ASCII-слаг имени файла; русское название резолвится на бэке
// (src/routes/stream.js → resolveBySlug). Подробности — в src/lib/playlist.js.
//
//   node scripts/gen-stream-playlist.js
import { config } from '../src/lib/config.js';
import { regeneratePlaylist } from '../src/lib/playlist.js';

const n = regeneratePlaylist();
console.log(`Записано ${n} треков → ${config.playlistPath}`);
