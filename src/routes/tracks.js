import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isProd } from '../lib/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', '..', 'public', 'assets');
const cdnManifest = join(assetsDir, 'tracks.json');
const localManifest = join(assetsDir, 'tracks.local.json');

// В dev предпочитаем локальные треки (/media, same-origin → анализатор частот
// работает без CORS). В проде — CDN-манифест.
function manifestFile() {
  if (!isProd && existsSync(localManifest)) return localManifest;
  return cdnManifest;
}

let cache = null;
let cacheMtime = 0;

function loadTracks() {
  const manifestPath = manifestFile();
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
