import { db } from '../lib/db.js';

const latest = db.prepare('SELECT * FROM forecast ORDER BY date DESC, id DESC LIMIT 1');
const byId = db.prepare('SELECT * FROM forecast WHERE id = ?');

export default async function forecastRoutes(app) {
  // Актуальный прогноз для блока на главной (последний доступный)
  app.get('/forecast/today', async (req, reply) => {
    const row = latest.get();
    reply.header('cache-control', 'public, max-age=120');
    if (!row) return { ok: true, forecast: null };
    return { ok: true, forecast: row };
  });

  // Полный прогноз по id
  app.get('/forecast/:id', async (req, reply) => {
    const row = byId.get(Number(req.params.id));
    if (!row) return reply.code(404).send({ ok: false, error: 'not_found' });
    return { ok: true, forecast: row };
  });
}
