// Локальная подготовка треков для разработки:
// копирует mp3 из распакованного архива в public/media/audio с ASCII-именами
// и пишет public/assets/tracks.json с локальными URL (/media/audio/...).
// Для прода манифест перезаписывает scripts/upload-tracks.js (CDN-URL).
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTrackList } from './lib-tracks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '_unpacked');
const MEDIA = join(__dirname, '..', 'public', 'media', 'audio');
// Локальный манифест отдельным файлом: dev-сервер предпочитает его,
// прод использует tracks.json (CDN). Так реальный анализатор работает в обоих.
const MANIFEST = join(__dirname, '..', 'public', 'assets', 'tracks.local.json');

mkdirSync(MEDIA, { recursive: true });

const tracks = buildTrackList(SRC);
if (!tracks.length) {
  console.error('Не найдено ни одного mp3 в', SRC);
  process.exit(1);
}

const manifest = tracks.map(({ file, title, key }) => {
  const fname = `${key}.mp3`;
  copyFileSync(file, join(MEDIA, fname));
  return {
    title,
    artist: 'Клан Толкай Вода',
    url: `/media/audio/${fname}`,
    cover: '/assets/img/cover-default.webp',
  };
});

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`Готово: ${manifest.length} треков → public/media/audio, манифест → ${MANIFEST}`);
