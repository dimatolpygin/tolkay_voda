// SEO «под капотом»: динамический sitemap.xml из БД и ЧПУ /blog/:slug
// с серверной подстановкой мета-тегов статьи (title/description/og/canonical/JSON-LD).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from '../lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const postHtmlPath = join(__dirname, '..', '..', 'public', 'post.html');

// Базовый URL сайта (для canonical/og/sitemap). В проде SITE_DOMAIN=tolkay-voda.ru.
const RAW_DOMAIN = (process.env.SITE_DOMAIN || '').trim();
const DOMAIN = RAW_DOMAIN && !RAW_DOMAIN.startsWith(':') ? RAW_DOMAIN : 'tolkay-voda.ru';
const BASE = `https://${DOMAIN}`;

const listForSitemap = db.prepare(
  'SELECT slug, created_at FROM posts WHERE published = 1 ORDER BY created_at DESC, id DESC'
);
const postBySlug = db.prepare('SELECT * FROM posts WHERE slug = ? AND published = 1');

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Абсолютный URL картинки для og:image.
function absImage(url) {
  // Фолбэк — JPEG-карточка (Telegram не показывает WebP в превью).
  if (!url) return `${BASE}/assets/img/og-cover.jpg`;
  if (/^https?:\/\//i.test(url)) return url;
  return BASE + (url.startsWith('/') ? url : '/' + url);
}

function plain(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

export default async function seoRoutes(app) {
  // robots.txt отдаётся статикой (public/robots.txt).

  app.get('/sitemap.xml', async (req, reply) => {
    const posts = listForSitemap.all();
    const urls = [
      `  <url><loc>${BASE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      `  <url><loc>${BASE}/privacy.html</loc><changefreq>yearly</changefreq><priority>0.2</priority></url>`,
      ...posts.map((p) => {
        const lastmod = String(p.created_at || '').slice(0, 10);
        return `  <url><loc>${BASE}/blog/${encodeURIComponent(p.slug)}</loc>${
          lastmod ? `<lastmod>${lastmod}</lastmod>` : ''
        }<changefreq>monthly</changefreq><priority>0.6</priority></url>`;
      }),
    ];
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join('\n') +
      '\n</urlset>\n';
    reply.header('content-type', 'application/xml; charset=utf-8');
    reply.header('cache-control', 'public, max-age=600');
    return xml;
  });

  // ЧПУ статьи: отдаём post.html с серверными мета-тегами (для индексации и шаринга).
  app.get('/blog/:slug', async (req, reply) => {
    const post = postBySlug.get(req.params.slug);
    let html = readFileSync(postHtmlPath, 'utf8');

    if (!post) {
      reply.code(404).header('content-type', 'text/html; charset=utf-8');
      return html; // клиентский скрипт покажет «Статья не найдена»
    }

    const url = `${BASE}/blog/${encodeURIComponent(post.slug)}`;
    const title = `${plain(post.title)} — Радио «Толкай Вода»`;
    const desc = plain(post.excerpt || post.body).slice(0, 200);
    const image = absImage(post.image_url);

    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: plain(post.title),
      description: desc,
      image: [image],
      datePublished: post.created_at,
      mainEntityOfPage: url,
      author: { '@type': 'Organization', name: 'Клан Толкай Вода' },
      publisher: {
        '@type': 'Organization',
        name: 'Радио Толкай Вода',
        logo: { '@type': 'ImageObject', url: `${BASE}/assets/img/logo.webp` },
      },
    };

    const head = [
      `<link rel="canonical" href="${esc(url)}" />`,
      `<meta property="og:type" content="article" />`,
      `<meta property="og:site_name" content="Радио Толкай Вода" />`,
      `<meta property="og:locale" content="ru_RU" />`,
      `<meta property="og:title" content="${esc(plain(post.title))}" />`,
      `<meta property="og:description" content="${esc(desc)}" />`,
      `<meta property="og:url" content="${esc(url)}" />`,
      `<meta property="og:image" content="${esc(image)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(plain(post.title))}" />`,
      `<meta name="twitter:description" content="${esc(desc)}" />`,
      `<meta name="twitter:image" content="${esc(image)}" />`,
      `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    ].join('\n  ');

    html = html
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
      .replace(
        /(<meta name="description" content=")[^"]*(")/,
        `$1${esc(desc)}$2`
      )
      .replace('</head>', `  ${head}\n</head>`);

    reply.header('content-type', 'text/html; charset=utf-8');
    reply.header('cache-control', 'public, max-age=300');
    return html;
  });
}
