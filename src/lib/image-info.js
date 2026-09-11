// Размер картинки из заголовка файла — без графических библиотек.
// Нужен панели, чтобы предупредить: баннер рисуется в пропорции 16:9 и картинку
// другого формата растянет и обрежет. Именно так логотип 181x65 превратился
// на сайте в размытый обрезок (2026-09-11).
//
// Читаем только шапку файла: PNG — IHDR, JPEG — маркер SOF, WebP — VP8/VP8L/VP8X.

function pngSize(b) {
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++; // мусор между сегментами — идём дальше по байту
      continue;
    }
    const marker = b[i + 1];
    // SOF0-3, SOF5-7, SOF9-11, SOF13-15 несут размеры; DHT/DAC/SOS — нет.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // маркеры без длины
      continue;
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function webpSize(b) {
  if (b.length < 30) return null;
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    const w = b[24] | (b[25] << 8) | (b[26] << 16);
    const h = b[27] | (b[28] << 8) | (b[29] << 16);
    return { width: w + 1, height: h + 1 };
  }
  return null;
}

// { width, height } или null, если формат не распознан.
export function imageSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  return pngSize(buffer) || jpegSize(buffer) || webpSize(buffer) || null;
}

// Баннер рисуется в 16:9 с обрезкой по краям (object-fit: cover).
export const AD_RATIO = 16 / 9; // 1.78
const MIN_AD_WIDTH = 800;

// Допустимые пропорции: от 16:10 до 2:1. В этих границах обрезается не больше
// десятой части картинки — незаметно. За ними начинается то, ради чего проверка
// и появилась: логотип 181×65 (2.78) и скриншот 960×661 (1.45).
const MIN_RATIO = 1.55;
const MAX_RATIO = 2.05;

// Предупреждение для панели или '' , если с картинкой всё в порядке.
// Ничего не запрещает: клиент может сознательно поставить нестандартную картинку.
export function adImageWarning(size) {
  if (!size?.width || !size?.height) return '';
  const { width, height } = size;
  const ratio = width / height;
  const spec = 'Нужен формат 16:9, лучше 1200×675.';

  if (ratio < MIN_RATIO || ratio > MAX_RATIO) {
    return `Баннер сохранён, но картинка ${width}×${height} — это не 16:9, на сайте её обрежет по краям. ${spec}`;
  }
  if (width < MIN_AD_WIDTH) {
    return `Баннер сохранён, но картинка узкая (${width}×${height}) — на широком экране будет размытой. ${spec}`;
  }
  return '';
}
