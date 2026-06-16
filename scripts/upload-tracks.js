// Заливает mp3 из scripts/_unpacked на S3 Beget и пишет public/assets/tracks.json
// с CDN-URL. Запуск:
//   node scripts/upload-tracks.js --test   # залить только 1 файл (проверка доступа)
//   node scripts/upload-tracks.js          # залить все
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTrackList } from './lib-tracks.js';
import { bucketReachable, uploadObject, cdnUrl } from '../src/lib/s3.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '_unpacked');
const MANIFEST = join(__dirname, '..', 'public', 'assets', 'tracks.json');
const testMode = process.argv.includes('--test');
const manifestOnly = process.argv.includes('--manifest-only');

const PREFIX = 'audio';

async function main() {
  if (!manifestOnly) {
    process.stdout.write('Проверка доступа к бакету… ');
    await bucketReachable();
    console.log('OK');
  }

  const all = buildTrackList(SRC);

  if (manifestOnly) {
    const manifest = all.map(({ title, key }) => ({
      title,
      artist: 'Клан Толкай Вода',
      url: cdnUrl(`${PREFIX}/${key}.mp3`),
      cover: '/assets/img/cover-default.webp',
    }));
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`Манифест пересобран (без заливки): ${manifest.length} треков`);
    return;
  }

  const tracks = testMode ? all.slice(0, 1) : all;
  console.log(`К загрузке: ${tracks.length} из ${all.length}`);

  const manifest = [];
  let i = 0;
  for (const { file, title, key } of all) {
    const objKey = `${PREFIX}/${key}.mp3`;
    if (!testMode || i === 0) {
      const buf = readFileSync(file);
      process.stdout.write(`[${i + 1}/${all.length}] ${title} → ${objKey} … `);
      await uploadObject(objKey, buf, 'audio/mpeg');
      console.log('залит');
    }
    manifest.push({
      title,
      artist: 'Клан Толкай Вода',
      url: cdnUrl(objKey),
      cover: '/assets/img/cover-default.webp',
    });
    i++;
    if (testMode) break;
  }

  if (!testMode) {
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`Готово. Манифест обновлён: ${manifest.length} треков (CDN-URL) → ${MANIFEST}`);
  } else {
    console.log(`Тест: залит 1 файл. Проверь: ${manifest[0].url}`);
  }
}

main().catch((e) => {
  console.error('Ошибка:', e?.name, e?.message);
  process.exit(1);
});
