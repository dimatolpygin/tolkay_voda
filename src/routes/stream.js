// «Сейчас играет» из эфира: опрашиваем status-json Icecast и отдаём лёгкий JSON.
// Кеш на несколько секунд — чтобы поллинг с фронта не бил по Icecast на каждый запрос.
const ICECAST_HOST = process.env.ICECAST_HOST || 'icecast';
const ICECAST_PORT = process.env.ICECAST_PORT || '8000';
const STATUS_URL = `http://${ICECAST_HOST}:${ICECAST_PORT}/status-json.xsl`;

let cache = { at: 0, data: null };
const TTL_MS = 4000;

// ICY-метаданные приходят как "Artist - Title" или просто title.
function splitTitle(raw, fallbackArtist) {
  const s = String(raw || '').trim();
  if (!s) return { title: '', artist: fallbackArtist || '' };
  const i = s.indexOf(' - ');
  if (i > 0) return { artist: s.slice(0, i).trim(), title: s.slice(i + 3).trim() };
  return { title: s, artist: fallbackArtist || '' };
}

export default async function streamRoutes(app) {
  app.get('/stream/now', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=5');
    const now = Date.now();
    if (cache.data && now - cache.at < TTL_MS) return cache.data;

    let data = { ok: true, online: false, title: '', artist: '', listeners: 0 };
    try {
      const res = await fetch(STATUS_URL, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const j = await res.json();
        let src = j?.icestats?.source;
        if (Array.isArray(src)) {
          src = src.find((s) => /stream/.test(s.listenurl || '')) || src[0];
        }
        if (src) {
          const { title, artist } = splitTitle(src.title || src.yp_currently_playing, src.artist);
          data = {
            ok: true,
            online: true,
            title,
            artist,
            listeners: Number(src.listeners) || 0,
          };
        }
      }
    } catch {
      // Icecast недоступен → online:false, фронт уйдёт в фолбэк-джукбокс.
    }
    cache = { at: now, data };
    return data;
  });
}
