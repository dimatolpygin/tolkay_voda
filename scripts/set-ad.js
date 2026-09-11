// Управление рекламными слотами из командной строки (этап 16).
// До появления панели (этап 17) это единственный способ поставить баннер.
// Меняет только БД — сайт подхватывает новый баннер без передеплоя.
//
//   node scripts/set-ad.js list
//   node scripts/set-ad.js set <слот> <url-картинки> <url-ссылки> ["текст кнопки"]
//   node scripts/set-ad.js clear <слот>
//
// На сервере: docker exec tolkay-app node scripts/set-ad.js list
import { listAds, getAdRaw, setAd, clearAd, AD_SLOTS, AdValidationError } from '../src/lib/ads-store.js';

const [cmd, ...rest] = process.argv.slice(2);

function usage() {
  console.log('Использование:');
  console.log('  node scripts/set-ad.js list');
  console.log('  node scripts/set-ad.js set <слот> <url-картинки> <url-ссылки> ["текст кнопки"]');
  console.log('  node scripts/set-ad.js clear <слот>');
}

function show() {
  for (const slot of AD_SLOTS) {
    const row = getAdRaw(slot);
    if (!row) {
      console.log(`Слот ${slot}: пусто`);
      continue;
    }
    console.log(`Слот ${slot}: ${row.image_url}`);
    console.log(`         ссылка: ${row.link_url}`);
    console.log(`         кнопка: ${row.button_text || '(нет, кликабельна вся картинка)'}`);
    console.log(`         обновлён: ${row.updated_at}`);
  }
  const shown = listAds().length;
  console.log(`\nНа сайте покажется слотов: ${shown}`);
}

try {
  if (cmd === 'list' || !cmd) {
    show();
  } else if (cmd === 'set') {
    const [slot, imageUrl, linkUrl, buttonText] = rest;
    if (!slot || !imageUrl || !linkUrl) {
      usage();
      process.exit(1);
    }
    setAd({ slot, imageUrl, linkUrl, buttonText });
    console.log(`Слот ${slot} обновлён.\n`);
    show();
  } else if (cmd === 'clear') {
    const [slot] = rest;
    if (!slot) {
      usage();
      process.exit(1);
    }
    const changes = clearAd(slot);
    console.log(changes ? `Слот ${slot} очищен.\n` : `Слот ${slot} и так был пуст.\n`);
    show();
  } else {
    usage();
    process.exit(1);
  }
} catch (err) {
  if (err instanceof AdValidationError) {
    console.error(`Ошибка: ${err.message} (${err.code})`);
    process.exit(1);
  }
  throw err;
}
