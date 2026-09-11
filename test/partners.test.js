// Баннер партнёра должен пережить блокировщик рекламы.
//
// 11.09.2026 клиент поставил баннер через панель и не увидел его на сайте.
// Картинка была верная (1200x675, 190 КБ), карточка приходила в HTML, но в его
// браузере получала display:none — не от нашего CSS, а от косметического фильтра
// блокировщика, который режет всё с классом ad/ads. Этот тест держит разметку
// чистой от таких имён.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const dbFile = join(tmpdir(), `tolkay-partners-test-${randomUUID()}.db`);
process.env.DB_PATH = dbFile;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

let app;
let setAd;

before(async () => {
  const Fastify = (await import('fastify')).default;
  const homeRoutes = (await import('../src/routes/home.js')).default;
  const partnersRoutes = (await import('../src/routes/partners.js')).default;
  ({ setAd } = await import('../src/lib/ads-store.js'));

  app = Fastify({ logger: false });
  await app.register(partnersRoutes, { prefix: '/api' });
  await app.register(homeRoutes);
  await app.ready();

  process.on('exit', () => {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        rmSync(dbFile + suffix);
      } catch {
        /* временный файл мог не создаться — неважно */
      }
    }
  });
});

// Слова, по которым блокировщики прячут элементы и режут запросы.
// Ищем только там, где фильтр их видит: class, id, src, href, адрес запроса.
const BLOCKED = /\b(class|id)="[^"]*\bads?\b[^"]*"|(src|href)="[^"]*\/ads?[/.][^"]*"/;

describe('баннеры партнёров', () => {
  test('адрес запроса не содержит ad/ads', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/partners' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true, partners: [] });

    const old = await app.inject({ method: 'GET', url: '/api/ads' });
    assert.equal(old.statusCode, 404, 'старый адрес со словом ads не должен остаться');
  });

  test('пустые слоты — блок скрыт, имена классов чистые', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /<section class="partners" id="partners" hidden>/);
    assert.equal(BLOCKED.test(res.body), false, 'в разметке остались имена со словом ad/ads');
  });

  test('заполненный слот — карточка есть, и ни одного ad/ads в именах', async () => {
    setAd({
      slot: 1,
      imageKey: 'partners/test.png',
      imageUrl: 'https://cdn.example/partners/test.png',
      linkUrl: 'https://sellme.pro/',
      buttonText: 'Купить продвижение',
    });

    const res = await app.inject({ method: 'GET', url: '/' });
    assert.match(res.body, /class="partner card"/);
    assert.match(res.body, /class="partner__img"/);
    assert.match(res.body, /https:\/\/cdn\.example\/partners\/test\.png/);
    assert.match(res.body, /Купить продвижение/);
    assert.equal(BLOCKED.test(res.body), false, 'в разметке остались имена со словом ad/ads');
  });

  test('картинки баннеров лежат под префиксом partners, а не ads', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/admin/routes/ads.js', import.meta.url), 'utf8');
    assert.match(src, /uploadImage\(files\.image, 'partners'\)/);
  });
});
