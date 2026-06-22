// «Сейчас играет» из эфира: опрашиваем status-json Icecast и отдаём лёгкий JSON.
// Кеш на несколько секунд — чтобы поллинг с фронта не бил по Icecast на каждый запрос.
//
// ICY-метаданные Icecast не умеют надёжно нести кириллицу (поле title приходит
// пустым/битым). Поэтому в эфир уходит ASCII-слаг имени файла
// (напр. "47-carstvo-ne-tam-za-goroi"), а человекочитаемое русское название
// резолвим здесь по фонотеке в БД: slug → { title, artist }.
import { listTracks } from '../lib/tracks-store.js';

const ICECAST_HOST = process.env.ICECAST_HOST || 'icecast';
const ICECAST_PORT = process.env.ICECAST_PORT || '8000';
const STATUS_URL = `http://${ICECAST_HOST}:${ICECAST_PORT}/status-json.xsl`;

// slug = имя файла из URL без расширения: .../audio/47-carstvo-....mp3 → 47-carstvo-...
function slugFromUrl(url) {
  const base = String(url || '').split('/').pop() || '';
  return base.replace(/\.[^.]+$/, '').toLowerCase();
}

// Карта slug → { title, artist } из БД (лёгкий кэш на 60с).
let trackMap = null;
let trackMapAt = 0;
function loadTrackMap() {
  const now = Date.now();
  if (trackMap && now - trackMapAt < 60_000) return trackMap;
  const map = [];
  try {
    for (const t of listTracks()) {
      if (t && t.url) {
        map.push({ slug: slugFromUrl(t.url), title: t.title || '', artist: t.artist || '' });
      }
    }
  } catch {
    // БД недоступна → пустая карта → фолбэк на бренд на фронте
  }
  trackMap = map;
  trackMapAt = now;
  return map;
}

// Резолвим русское название по ASCII-слагу из ICY-метаданных потока.
// Слаг начинается с уникального префикса "NN-", поэтому includes() безопасен:
// ни один слаг не является подстрокой другого.
function resolveBySlug(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  const map = loadTrackMap();
  return map.find((t) => t.slug && (s === t.slug || s.includes(t.slug))) || null;
}

let cache = { at: 0, data: null };
const TTL_MS = 4000;

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
          const raw = src.title || src.yp_currently_playing || '';
          const hit = resolveBySlug(raw);
          data = {
            ok: true,
            online: true,
            title: hit ? hit.title : '',
            artist: hit ? hit.artist : '',
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
