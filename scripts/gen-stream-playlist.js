// Генерирует плейлист для Liquidsoap из public/assets/tracks.json.
// Каждая строка — annotate-URI: метаданные «сейчас играет» + CDN-URL трека.
// Источник аудио остаётся на CDN — на сервере 50 mp3 не хранятся.
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

const tracks = JSON.parse(readFileSync(src, 'utf8'));
const list = Array.isArray(tracks) ? tracks : tracks.tracks || [];
const lines = list
  .filter((t) => t && t.url)
  .map((t) => `annotate:title="${esc(t.title)}",artist="${esc(t.artist)}":${t.url}`);

const header = '# Плейлист эфира Liquidsoap — сгенерирован из tracks.json (scripts/gen-stream-playlist.js).\n';
writeFileSync(out, header + lines.join('\n') + '\n', 'utf8');
console.log(`Записано ${lines.length} треков → ${out}`);
