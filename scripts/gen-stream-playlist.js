// Генерирует плейлист для Liquidsoap из public/assets/tracks.json.
// Каждая строка — annotate-URI: метаданные «сейчас играет» + CDN-URL трека.
// Источник аудио остаётся на CDN — на сервере 50 mp3 не хранятся.
//
// ВАЖНО: в ICY-метаданные потока пишем не русское название, а ASCII-слаг имени
// файла (напр. "47-carstvo-ne-tam-za-goroi"). Icecast не доносит кириллицу в
// status-json (поле title приходит пустым/битым), поэтому человекочитаемое
// русское название резолвится на бэке по слагу через tracks.json
// (см. src/routes/stream.js → resolveBySlug).
//
//   node scripts/gen-stream-playlist.js
//   → docker/liquidsoap/playlist.m3u
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'public', 'assets', 'tracks.json');
const out = join(root, 'docker', 'liquidsoap', 'playlist.m3u');

// Экранируем кавычки для annotate-протокола Liquidsoap (annotate:k="v",...:URI)
const esc = (s) => String(s || '').replace(/"/g, '\\"');

// slug = имя файла из URL без расширения: .../audio/47-carstvo-....mp3 → 47-carstvo-...
const slugFromUrl = (url) => {
  const base = String(url || '').split('/').pop() || '';
  return base.replace(/\.[^.]+$/, '');
};

const tracks = JSON.parse(readFileSync(src, 'utf8'));
const list = Array.isArray(tracks) ? tracks : tracks.tracks || [];
const lines = list
  .filter((t) => t && t.url)
  .map((t) => `annotate:title="${esc(slugFromUrl(t.url))}":${t.url}`);

const header = '# Плейлист эфира Liquidsoap — сгенерирован из tracks.json (scripts/gen-stream-playlist.js).\n';
writeFileSync(out, header + lines.join('\n') + '\n', 'utf8');
console.log(`Записано ${lines.length} треков → ${out}`);
