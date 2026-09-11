// Проверки панели: вход, защита от перебора, CSRF, публикация контента.
// БД — временный файл, сеть не трогаем: маршруты поднимаются через
// fastify.inject(), поэтому ни порт, ни S3, ни плейлист эфира не задействованы.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const dbFile = join(tmpdir(), `tolkay-admin-test-${randomUUID()}.db`);
process.env.DB_PATH = dbFile;
process.env.ADMIN_LOGIN = 'redaktor';
process.env.ADMIN_PASSWORD = 'pervyi-parol';
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = ''; // без ИИ — грубый разбор прогноза
process.env.LOG_LEVEL = 'silent';

let app;
let auth; // модуль авторизации — нужен для сброса счётчика попыток

const PASSWORD = 'novyi-parol-777';

before(async () => {
  const Fastify = (await import('fastify')).default;
  const adminPlugin = (await import('../src/admin/index.js')).default;
  auth = await import('../src/admin/auth.js');

  app = Fastify({ logger: false });
  await app.register(adminPlugin, { prefix: '/admin' });
  await app.ready();

  process.on('exit', () => {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        rmSync(dbFile + suffix);
      } catch {
        /* временный файл мог не создаться — неважно */
      }
    }
  });
});

// --- вспомогательное ---

const cookieOf = (res) => (res.headers['set-cookie'] || '').toString().split(';')[0];

async function login(password = PASSWORD, login = 'redaktor') {
  auth.resetAttempts();
  return app.inject({
    method: 'POST',
    url: '/admin/login',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ login, password }).toString(),
  });
}

async function post(url, cookie, csrf, data = {}) {
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    payload: new URLSearchParams({ _csrf: csrf, ...data }).toString(),
  });
}

// CSRF-токен вытаскиваем со страницы — ровно так же, как это делает браузер.
function csrfFrom(html) {
  const m = /name="_csrf" value="([^"]+)"/.exec(html);
  assert.ok(m, 'на странице нет скрытого поля _csrf');
  return m[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

let cookie = '';
let csrf = '';

// --- тесты ---

describe('вход в панель', () => {
  test('без сессии панель не открывается', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin' });
    assert.equal(res.statusCode, 303);
    assert.equal(res.headers.location, '/admin/login');
  });

  test('страница входа не индексируется', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/login' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.match(res.body, /name="robots" content="noindex, nofollow"/);
  });

  test('пароль в базе лежит хешем scrypt, не открытым текстом', async () => {
    const admin = auth.getAdminByLogin('redaktor');
    assert.ok(admin, 'аккаунт из .env не создан');
    assert.match(admin.password_hash, /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
    assert.ok(!admin.password_hash.includes('pervyi-parol'));
  });

  test('неверный пароль не пускает', async () => {
    const res = await login('ne-tot-parol');
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Неверный логин или пароль/);
    assert.ok(!res.headers['set-cookie']);
  });

  test('после серии попыток вход блокируется', async () => {
    auth.resetAttempts();
    let res;
    for (let i = 0; i < 5; i++) {
      res = await app.inject({
        method: 'POST',
        url: '/admin/login',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ login: 'redaktor', password: 'mimo' }).toString(),
      });
    }
    // Шестая попытка — уже с верным паролем, и всё равно отказ.
    res = await app.inject({
      method: 'POST',
      url: '/admin/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ login: 'redaktor', password: 'pervyi-parol' }).toString(),
    });
    assert.match(res.body, /Слишком много попыток/);
    assert.ok(!res.headers['set-cookie']);
    auth.resetAttempts();
  });

  test('верный пароль пускает и ведёт на смену пароля при первом входе', async () => {
    const res = await login('pervyi-parol');
    assert.equal(res.statusCode, 303);
    assert.equal(res.headers.location, '/admin/password');
    cookie = cookieOf(res);
    assert.match(cookie, /^tv_admin=/);
    const setCookie = (res.headers['set-cookie'] || '').toString();
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Path=\/admin/);
  });

  test('до смены пароля остальные разделы закрыты', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/posts', headers: { cookie } });
    assert.equal(res.statusCode, 303);
    assert.equal(res.headers.location, '/admin/password');
  });

  test('смена пароля работает', async () => {
    const page = await app.inject({ method: 'GET', url: '/admin/password', headers: { cookie } });
    assert.equal(page.statusCode, 200);
    csrf = csrfFrom(page.body);

    const bad = await post('/admin/password', cookie, csrf, {
      current: 'pervyi-parol',
      next: 'korotko',
      repeat: 'korotko',
    });
    assert.match(decodeURIComponent(bad.headers.location), /не короче 8 символов/);

    const res = await post('/admin/password', cookie, csrf, {
      current: 'pervyi-parol',
      next: PASSWORD,
      repeat: PASSWORD,
    });
    assert.equal(res.statusCode, 303);
    assert.match(decodeURIComponent(res.headers.location), /^\/admin\?ok=/);

    const home = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });
    assert.equal(home.statusCode, 200);
    csrf = csrfFrom(home.body);
  });

  test('старый пароль больше не подходит', async () => {
    const res = await login('pervyi-parol');
    assert.match(res.body, /Неверный логин или пароль/);
  });
});

describe('защита форм', () => {
  test('POST без CSRF-токена не проходит', async () => {
    const res = await post('/admin/posts/new', cookie, 'poddelka', {
      title: 'Взлом',
      body: 'Текст',
    });
    assert.equal(res.statusCode, 303);
    assert.match(decodeURIComponent(res.headers.location), /Форма устарела/);
  });

  test('POST с чужого сайта отклоняется по Origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/posts/new',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
        origin: 'https://zloi-sait.example',
      },
      payload: new URLSearchParams({ _csrf: csrf, title: 'Взлом', body: 'Текст' }).toString(),
    });
    assert.equal(res.statusCode, 403);
  });

  test('чужая cookie не даёт доступа', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { cookie: 'tv_admin=vydumannyi-token' },
    });
    assert.equal(res.statusCode, 303);
    assert.equal(res.headers.location, '/admin/login');
  });
});

describe('контент', () => {
  test('статья создаётся, правится и удаляется', async () => {
    const created = await post('/admin/posts/new', cookie, csrf, {
      title: 'Тайны Царства Небесного',
      body: 'Первый абзац.\n\nВторой абзац.',
    });
    assert.equal(created.statusCode, 303);
    const id = /\/admin\/posts\/(\d+)/.exec(created.headers.location)[1];
    assert.match(decodeURIComponent(created.headers.location), /tainy-carstva-nebesnogo/);

    const page = await app.inject({ method: 'GET', url: `/admin/posts/${id}`, headers: { cookie } });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Тайны Царства Небесного/);

    const edited = await post(`/admin/posts/${id}`, cookie, csrf, {
      title: 'Новый заголовок',
      body: 'Другой текст статьи.',
    });
    assert.equal(edited.statusCode, 303);

    const after = await app.inject({ method: 'GET', url: `/admin/posts/${id}`, headers: { cookie } });
    assert.match(after.body, /Новый заголовок/);

    const removed = await post(`/admin/posts/${id}/delete`, cookie, csrf);
    assert.match(decodeURIComponent(removed.headers.location), /Статья удалена/);
  });

  test('прогноз разбирается без ИИ и публикуется', async () => {
    const prepared = await post('/admin/forecast/prepare', cookie, csrf, {
      raw: '28-й Солнечный день, 1/2 Лунные дни\n\nСегодня день спокойной воды и внимательных решений, не спешите.',
    });
    assert.equal(prepared.statusCode, 200);
    assert.match(prepared.body, /Предпросмотр/);
    assert.match(prepared.body, /Солнечный день/);

    const published = await post('/admin/forecast/publish', cookie, csrf, {
      subtitle: '28-й Солнечный день',
      intro: 'День спокойной воды.',
      water: 'Тёплая',
      color: 'Синий',
      food: 'Каша',
      advice: 'Не спешите',
      full: 'Полный текст прогноза.',
    });
    assert.equal(published.statusCode, 303);
    const id = /\/admin\/forecast\/(\d+)/.exec(published.headers.location)[1];

    const page = await app.inject({ method: 'GET', url: `/admin/forecast/${id}`, headers: { cookie } });
    assert.match(page.body, /Тёплая/);
    assert.match(page.body, /Не спешите/);
  });

  test('баннер ставится ссылкой и снимается', async () => {
    const set = await post('/admin/ads/1', cookie, csrf, {
      imageUrl: 'https://cdn.example/banner.jpg',
      linkUrl: 'https://partner.example/',
      buttonText: 'Перейти на сайт',
    });
    assert.match(decodeURIComponent(set.headers.location), /Баннер в слоте 1 сохранён/);

    const page = await app.inject({ method: 'GET', url: '/admin/ads', headers: { cookie } });
    assert.match(page.body, /partner\.example/);

    const bad = await post('/admin/ads/2', cookie, csrf, {
      imageUrl: 'https://cdn.example/b.jpg',
      linkUrl: 'javascript:alert(1)',
    });
    assert.match(decodeURIComponent(bad.headers.location), /http или https/);

    const cleared = await post('/admin/ads/1/delete', cookie, csrf);
    assert.match(decodeURIComponent(cleared.headers.location), /Слот 1 освобождён/);
  });

  test('последнюю песню удалить нельзя', async () => {
    const { listTracks, deleteTrack } = await import('../src/lib/tracks-store.js');
    const tracks = listTracks();
    assert.ok(tracks.length > 1, 'в тестовой базе должны быть треки из сида');
    // Оставляем ровно один трек и пробуем удалить его.
    for (const t of tracks.slice(1)) deleteTrack(t.id);
    const res = await post(`/admin/tracks/${tracks[0].id}/delete`, cookie, csrf);
    assert.match(decodeURIComponent(res.headers.location), /Нельзя удалить последнюю песню/);
  });
});

describe('выход', () => {
  test('после выхода сессия не работает', async () => {
    const res = await post('/admin/logout', cookie, csrf);
    assert.equal(res.statusCode, 303);
    const after = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });
    assert.equal(after.statusCode, 303);
    assert.equal(after.headers.location, '/admin/login');
  });
});
