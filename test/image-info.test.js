// Размеры картинок читаются из заголовка файла. Эталонные значения сверены
// независимо (Pillow) по ассетам самого сайта.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { imageSize, adImageWarning } from '../src/lib/image-info.js';

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

describe('предупреждение о картинке баннера', () => {
  test('16:9 нужного размера — молчим', () => {
    assert.equal(adImageWarning({ width: 1200, height: 675 }), '');
    assert.equal(adImageWarning({ width: 1920, height: 1080 }), '');
  });

  test('логотип вместо баннера — предупреждаем', () => {
    // Ровно тот случай, из-за которого предупреждение и появилось: 181x65.
    const w = adImageWarning({ width: 181, height: 65 });
    assert.match(w, /не 16:9/);
    assert.match(w, /1200×675/);
  });

  test('правильная пропорция, но мелкая картинка — предупреждаем', () => {
    assert.match(adImageWarning({ width: 480, height: 270 }), /размытой/);
  });

  test('размер неизвестен — не выдумываем', () => {
    assert.equal(adImageWarning(null), '');
    assert.equal(adImageWarning({ width: 0, height: 0 }), '');
  });
});
