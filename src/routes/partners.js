// Баннеры партнёров под плеером (этап 16) — только чтение.
//
// Путь и поля называются «partners», а не «ads», намеренно: блокировщики рекламы
// режут всё со словом ad/ads в адресе, классе или id. Клиент продаёт эти слоты —
// баннер обязан показываться и у посетителя с блокировщиком (11.09.2026).
import { listAds } from '../lib/ads-store.js';

export default async function partnersRoutes(app) {
  // Заполненные слоты: [{ slot, imageUrl, linkUrl, buttonText }]
  app.get('/partners', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return { ok: true, partners: listAds() };
  });
}
