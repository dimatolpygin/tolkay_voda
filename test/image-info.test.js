// Размеры картинок читаются из заголовка файла. Эталонные значения сверены
// независимо (Pillow) по ассетам самого сайта.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { imageSize, checkAdImage } from '../src/lib/image-info.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const asset = (name) => readFileSync(join(__dirname, '..', 'public', 'assets', 'img', name));

describe('размер картинки из заголовка', () => {
  test('JPEG', () => {
    assert.deepEqual(imageSize(asset('og-cover.jpg')), { width: 1200, height: 630 });
  });

  test('WEBP с потерями', () => {
    assert.deepEqual(imageSize(asset('cover-default.webp')), { width: 600, height: 319 });
  });

  test('WEBP большой', () => {
    assert.deepEqual(imageSize(asset('bg-desktop.webp')), { width: 2048, height: 1152 });
  });

  test('WEBP вертикальный', () => {
    assert.deepEqual(imageSize(asset('logo.webp')), { width: 400, height: 437 });
  });

  test('PNG', () => {
    // Минимальный PNG 1200x675, собранный вручную: важна только шапка IHDR.
    const b = Buffer.alloc(24);
    b.writeUInt32BE(0x89504e47, 0);
    b.writeUInt32BE(1200, 16);
    b.writeUInt32BE(675, 20);
    assert.deepEqual(imageSize(b), { width: 1200, height: 675 });
  });

  test('не картинка — null, а не падение', () => {
    assert.equal(imageSize(Buffer.from('это просто текст, а не картинка вовсе')), null);
    assert.equal(imageSize(Buffer.alloc(4)), null);
    assert.equal(imageSize(null), null);
  });
});

// Синтетический PNG заданного размера и веса: проверке важны только шапка IHDR
// и длина файла.
function png(width, height, bytes = 50_000) {
  const b = Buffer.alloc(Math.max(24, bytes));
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

describe('проверка картинки баннера', () => {
  test('16:9 нужного размера — берём молча', () => {
    assert.deepEqual(checkAdImage(png(1200, 675)), {});
    assert.deepEqual(checkAdImage(png(1920, 1080)), {});
  });

  test('близкие пропорции тоже берём', () => {
    assert.deepEqual(checkAdImage(png(1600, 1000)), {}); // 16:10
    assert.deepEqual(checkAdImage(png(1200, 630)), {}); // og-картинка
    assert.deepEqual(checkAdImage(png(2000, 1000)), {}); // 2:1
  });

  test('логотип вместо баннера — отказ с причиной', () => {
    // Первый случай из жизни: логотип 181×65 растянуло и обрезало.
    const v = checkAdImage(png(181, 65));
    assert.match(v.error, /181×65/);
    assert.match(v.error, /вытянутая/);
    assert.match(v.error, /1200×675/);
    assert.equal(v.warning, undefined);
  });

  test('скриншот 4:3 — отказ с причиной', () => {
    // Второй и третий случай: 960×661 и 1448×1086.
    assert.match(checkAdImage(png(960, 661)).error, /высокая/);
    assert.match(checkAdImage(png(1448, 1086)).error, /1448×1086/);
  });

  test('правильная пропорция, но мелкая картинка — отказ', () => {
    assert.match(checkAdImage(png(480, 270)).error, /размытой/);
  });

  test('тяжёлый файл — берём, но предупреждаем', () => {
    const v = checkAdImage(png(1200, 675, 1_325_933));
    assert.equal(v.error, undefined);
    assert.match(v.warning, /1\.3 МБ/);
    assert.match(v.warning, /JPG/);
  });

  test('размеры не читаются — отказ, а не молчание', () => {
    assert.match(checkAdImage(Buffer.from('это не картинка, а просто текст тут')).error, /размеры/);
    assert.match(checkAdImage(Buffer.alloc(4)).error, /размеры/);
  });
});
