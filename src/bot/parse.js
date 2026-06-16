// Разбор сообщений бота. Чистые функции без побочных эффектов — легко тестировать.
//
// Протокол:
//   ПРОГНОЗ — первая строка начинается со слова «Прогноз» (или «#прогноз»).
//     Эта строка-маркер отбрасывается, остальное — тело прогноза.
//   СТАТЬЯ — всё остальное: первая строка = заголовок, дальше — тело.

// Граница слова через lookahead: \b в JS не работает с кириллицей (\w — латиница).
// После «прогноз» не должна идти буква, иначе «Прогнозирование» ложно совпадёт.
const FORECAST_RE = /^#?\s*прогноз(?![а-яёa-z])/i;
const FORECAST_TITLE = 'Прогноз от Геннадия Серафимовича';

function lines(text) {
  return String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n');
}

// Первый абзац (до пустой строки), обрезанный до max символов по границе слова.
function firstParagraph(text, max) {
  const para = (String(text).split(/\n\s*\n/)[0] || '').trim() || String(text).trim();
  if (para.length <= max) return para;
  return para.slice(0, max).replace(/\s+\S*$/, '').trim() + '…';
}

export function isForecast(text) {
  const first = (lines(text)[0] || '').trim();
  return FORECAST_RE.test(first);
}

export function parseForecast(text) {
  const ls = lines(text);
  ls.shift(); // убрать строку-маркер «Прогноз…»
  const body = ls.join('\n').trim();
  return { title: FORECAST_TITLE, summary: firstParagraph(body, 280), body };
}

export function parsePost(text) {
  const ls = lines(text);
  const title = (ls.shift() || '').trim();
  const body = ls.join('\n').trim();
  return { title, excerpt: firstParagraph(body, 180), body };
}
