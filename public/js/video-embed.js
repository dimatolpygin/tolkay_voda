// Видео в теле статьи: редактор вставляет в текст код с RuTube, VK или YouTube,
// и на странице появляется плеер. Просто ссылка на ролик работает так же.
//
// Чужой HTML в страницу не попадает: из вставленного кода берём только адрес
// ролика и собираем плеер сами. Всё, что не опознано как видео, остаётся текстом.
//
// Файл лежит в public/, потому что его читают оба конца: страница статьи
// (public/js/post.js) и сервер, когда собирает анонс и описание для поисковиков
// (src/lib/post-text.js). Две копии правил разошлись бы на первой же правке.

const PROVIDERS = [
  {
    name: 'RuTube',
    // Код вставки rutube.ru/play/embed/<id>, ссылка rutube.ru/video/<id>/
    // и приватная ссылка rutube.ru/video/private/<id>/?p=<ключ>.
    re: /rutube\.ru\/(?:play\/embed|video(?:\/private)?)\/([0-9a-f]{16,})/i,
    src(m, raw) {
      const p = /[?&]p=([0-9A-Za-z_-]+)/.exec(raw);
      return `https://rutube.ru/play/embed/${m[1]}/${p ? `?p=${p[1]}` : ''}`;
    },
  },
  {
    name: 'VK Видео',
    // Готовый код вставки: vk.com/video_ext.php?oid=-123&id=456&hash=abc
    re: /(?:vk\.com|vkvideo\.ru)\/video_ext\.php\?([^"'\s>]+)/i,
    src(m) {
      const q = new URLSearchParams(m[1].replace(/&amp;/g, '&'));
      const keep = new URLSearchParams();
      for (const k of ['oid', 'id', 'hash', 'hd']) {
        if (q.get(k)) keep.set(k, q.get(k));
      }
      return `https://vk.com/video_ext.php?${keep.toString()}`;
    },
  },
  {
    name: 'VK Видео',
    // Обычная ссылка: vkvideo.ru/video-123_456 или vk.com/video-123_456.
    re: /(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/i,
    src: (m) => `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}`,
  },
  {
    name: 'YouTube',
    re: /(?:youtube(?:-nocookie)?\.com\/(?:embed|shorts|live)\/|youtu\.be\/|youtube\.com\/watch\?(?:[^"'\s>]*&)?v=)([A-Za-z0-9_-]{11})/i,
    src: (m) => `https://www.youtube.com/embed/${m[1]}`,
  },
];

// Строка целиком — это видео? Возвращает { name, src } либо null.
// Принимаем и код вставки, и голую ссылку: клиент может прислать любое.
export function videoEmbed(line) {
  const t = String(line || '').trim();
  if (!t) return null;

  const isIframe = /^<iframe[\s\S]*<\/iframe>\s*$/i.test(t);
  const isLink = /^https?:\/\/[^\s]+$/i.test(t);
  if (!isIframe && !isLink) return null;

  for (const p of PROVIDERS) {
    const m = p.re.exec(t);
    if (m) return { name: p.name, src: p.src(m, t) };
  }
  return null;
}

// Текст статьи без строк с видео — для анонса в ленте и описания в поиске.
export function withoutVideo(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !videoEmbed(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
