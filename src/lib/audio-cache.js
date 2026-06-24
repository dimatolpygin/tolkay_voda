// ВРЕМЕННОЕ РЕШЕНИЕ (2026-06-24): локальный кэш mp3-треков эфира.
//
// Зачем: CDN Beget (ceshocofureled.begetcdn.cloud) периодически отдаёт
// HTTP 523 «Origin is unreachable», из-за чего Liquidsoap не может скачать трек
// и эфир онемевает (mksafe → тишина). Origin S3 при прямом запросе стабилен,
// поэтому держим копию всех треков на диске сервера и играем эфир ЛОКАЛЬНО,
// не завися от CDN. Когда Beget починят — можно вернуться к CDN-плейлисту.
//
// Файлы качаются из S3 напрямую (getObjectToFile), минуя CDN. Имя файла на диске —
// basename ключа S3 (напр. audio/15-ce-aprel.mp3 → 15-ce-aprel.mp3).
import { existsSync, statSync, readdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { config } from './config.js';
import { logger } from './logger.js';
import { getObjectToFile } from './s3.js';

// Ключ объекта S3 для трека: из БД (s3_key) либо из pathname URL как запасной вариант.
function keyFor(track) {
  if (track.s3_key) return String(track.s3_key).replace(/^\/+/, '');
  try {
    return new URL(track.url).pathname.replace(/^\/+/, '');
  } catch {
    return '';
  }
}

// Локальный путь к файлу трека в кэше (или null, если ключ не определить).
export function localPathFor(track) {
  const key = keyFor(track);
  if (!key) return null;
  return join(config.audioCacheDir, basename(key));
}

// Лежит ли непустой файл трека в кэше.
export function isCached(track) {
  const p = localPathFor(track);
  try {
    return !!p && existsSync(p) && statSync(p).size > 0;
  } catch {
    return false;
  }
}

// Скачивает недостающие треки из S3 в кэш и удаляет файлы, которых больше нет в БД.
// Никогда не бросает — частичный кэш лучше пустого (плейлист подстрахуется CDN-URL).
// Возвращает { cached, downloaded, failed }.
export async function syncAudioCache(tracks) {
  let downloaded = 0;
  let failed = 0;
  const wanted = new Set();

  for (const t of tracks) {
    const key = keyFor(t);
    const p = localPathFor(t);
    if (!key || !p) continue;
    wanted.add(basename(p));
    if (isCached(t)) continue;
    try {
      await getObjectToFile(key, p);
      downloaded += 1;
      logger.info(`Кэш эфира: скачан ${basename(p)} (из S3, минуя CDN).`);
    } catch (err) {
      failed += 1;
      logger.warn(`Кэш эфира: не удалось скачать ${key}: ${err.message}`);
    }
  }

  // Прунинг: убираем из кэша файлы удалённых через бота треков.
  try {
    for (const name of readdirSync(config.audioCacheDir)) {
      if (name.endsWith('.part')) continue;
      if (!wanted.has(name)) {
        await unlink(join(config.audioCacheDir, name)).catch(() => {});
        logger.info(`Кэш эфира: удалён лишний файл ${name}.`);
      }
    }
  } catch {
    // папки ещё нет — ок, создастся при первом скачивании
  }

  const cached = tracks.filter(isCached).length;
  logger.info(`Кэш эфира синхронизирован: ${cached}/${tracks.length} на диске (скачано ${downloaded}, ошибок ${failed}).`);
  return { cached, downloaded, failed };
}
