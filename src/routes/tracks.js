import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, '..', '..', 'public', 'assets', 'tracks.json');

let cache = null;
let cacheMtime = 0;

function loadTracks() {
  if (!existsSync(manifestPath)) return [];
  try {
    const raw = readFileSync(manifestPath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : data.tracks || [];
  } catch {
    return [];
  }
}

export default async function tracksRoutes(app) {
  // Манифест треков: [{ title, artist, url, cover }]
  app.get('/tracks', async (req, reply) => {
    // лёгкий кэш на 60с, чтобы не читать файл на каждый запрос
    const now = Date.now();
    if (!cache || now - cacheMtime > 60_000) {
      cache = loadTracks();
      cacheMtime = now;
    }
    reply.header('cache-control', 'public, max-age=300');
    return { ok: true, tracks: cache };
  });
}
