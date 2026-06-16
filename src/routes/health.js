export default async function healthRoutes(app) {
  app.get('/health', async () => ({ ok: true, ts: Date.now() }));
}
