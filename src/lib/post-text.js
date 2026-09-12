// Анонс статьи для ленты и описание для поисковиков.
//
// Правила разбора видео берём из того же файла, что и страница статьи
// (public/js/video-embed.js): иначе в анонс попадёт голый код вставки вместо
// текста — ровно то, что увидел бы посетитель ленты 12.09.2026.
import { withoutVideo } from '../../public/js/video-embed.js';

export const EXCERPT_LIMIT = 180;

// Первый абзац без строк с видео. Статья из одного ролика даёт пустой анонс —
// это честнее, чем показывать в ленте кусок html.
export function excerptOf(body) {
  const text = withoutVideo(body);
  return (text.split(/\n\s*\n/)[0] || text).slice(0, EXCERPT_LIMIT).trim();
}

// Текст статьи без видео — на случай, когда анонса нет, а описание нужно.
export { withoutVideo };
