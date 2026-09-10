// Рекламные баннеры под плеером (этап 16) — только чтение.
// Управление слотами появится в панели на этапе 17; до неё слоты заполняются
// напрямую в базе (`npm run ads:set`), сайт подхватывает их без передеплоя.
import { listAds } from '../lib/ads-store.js';

export default async function adsRoutes(app) {
  // Заполненные слоты: [{ slot, imageUrl, linkUrl, buttonText }]
  app.get('/ads', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return { ok: true, ads: listAds() };
  });
}
