import { db } from '../lib/db.js';

const PAGE_SIZE = 9;

const listStmt = db.prepare(
  'SELECT id, slug, title, excerpt, image_url, created_at FROM posts WHERE published = 1 ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?'
);
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE published = 1');
const bySlug = db.prepare('SELECT * FROM posts WHERE slug = ? AND published = 1');

export default async function postsRoutes(app) {
  app.get('/posts', async (req, reply) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;
    const items = listStmt.all(PAGE_SIZE, offset);
    const total = countStmt.get().n;
    reply.header('cache-control', 'public, max-age=120');
    return {
      ok: true,
      page,
      pageSize: PAGE_SIZE,
      total,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      posts: items,
    };
  });

  app.get('/posts/:slug', async (req, reply) => {
    const row = bySlug.get(req.params.slug);
    if (!row) return reply.code(404).send({ ok: false, error: 'not_found' });
    return { ok: true, post: row };
  });
}
