// Манифест треков для фронта — из БД (фонотека управляется ботом, этап 13).
import { listTracks } from '../lib/tracks-store.js';

export default async function tracksRoutes(app) {
  // Манифест треков: [{ title, artist, url, cover }]
  app.get('/tracks', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    const tracks = listTracks().map((t) => ({
      title: t.title,
      artist: t.artist,
      url: t.url,
      cover: t.cover,
    }));
    return { ok: true, tracks };
  });
}
