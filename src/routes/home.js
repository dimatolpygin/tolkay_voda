// Главная отдаётся сервером, а не статикой: блок рекламных баннеров подставляется
// в разметку до отправки. Иначе он появляется после ответа /api/ads и толкает вниз
// прогноз и блог — измеренный CLS на десктопе рос с 0.057 до 0.098.
//
// Если баннеров нет, отдаётся исходный HTML без изменений, и блок остаётся скрытым.
// На страницах-фолбэках (setNotFoundHandler) серверной подстановки нет — там блок
// дорисовывает public/js/ads.js, он проверяет атрибут data-ssr.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listAds } from '../lib/ads-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, '..', '..', 'public', 'index.html');

// Файл не меняется в рантайме — читаем один раз при старте.
const indexHtml = readFileSync(indexPath, 'utf8');

// Заглушка блока в index.html; заменяем её целиком на готовые карточки.
const ADS_BLOCK = /<section class="ads" id="ads"[\s\S]*?<\/section>/;

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function card(ad) {
  // Подпись кнопки уже даёт ссылке доступное имя — не дублируем его в alt.
  const alt = ad.buttonText ? '' : 'Баннер партнёра';
  const cta = ad.buttonText ? `<span class="ad__cta">${esc(ad.buttonText)}</span>` : '';
  return (
    `<a class="ad card" href="${esc(ad.linkUrl)}" target="_blank"` +
    ` rel="noopener noreferrer nofollow sponsored">` +
    `<img class="ad__img" src="${esc(ad.imageUrl)}" alt="${esc(alt)}" loading="lazy" decoding="async" />` +
    `${cta}</a>`
  );
}

// Кэш готового HTML: пересобираем только когда меняется набор баннеров.
let cache = { key: null, html: indexHtml };

function renderHome() {
  const ads = listAds();
  const key = JSON.stringify(ads);
  if (key === cache.key) return cache.html;

  let html = indexHtml;
  if (ads.length) {
    const one = ads.length === 1 ? ' ads__grid--one' : '';
    const block =
      `<section class="ads" id="ads" data-ssr="1">` +
      `<div id="adsGrid" class="ads__grid${one}">${ads.map(card).join('')}</div>` +
      `</section>`;
    html = html.replace(ADS_BLOCK, block);
  }
  cache = { key, html };
  return html;
}

export default async function homeRoutes(app) {
  app.get('/', async (req, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    reply.header('cache-control', 'public, max-age=60');
    return renderHome();
  });
}
