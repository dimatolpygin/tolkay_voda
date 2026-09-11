// Вход, выход и смена пароля.
import { config } from '../../lib/config.js';
import {
  COOKIE_NAME,
  MIN_PASSWORD_LENGTH,
  changePassword,
  clearCookie,
  createSession,
  destroySession,
  getAdminByLogin,
  lockRemainingMs,
  noteFailure,
  noteSuccess,
  readCookie,
  sessionCookie,
  verifyPassword,
} from '../auth.js';
import { readForm, redirect, str, guard, FormError } from '../forms.js';
import { card, form, h1, input, layout, loginPage } from '../views.js';

const minutes = (ms) => Math.max(1, Math.ceil(ms / 60000));

export default async function authRoutes(app) {
  app.get('/login', async (req, reply) => {
    // Уже вошли — незачем показывать форму повторно.
    if (req.adminSession) return reply.code(303).header('location', '/admin').send();
    reply.header('content-type', 'text/html; charset=utf-8');
    return loginPage({ error: req.query.err || '', notice: req.query.ok || '' });
  });

  app.post('/login', async (req, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    const fields = req.body && typeof req.body === 'object' ? req.body : {};
    const login = str(fields, 'login', 100);
    const password = String(fields.password ?? '');
    const ip = req.ip;

    const left = lockRemainingMs(ip);
    if (left > 0) {
      req.log.warn(`Панель: вход заблокирован для ${ip} ещё ${minutes(left)} мин (перебор пароля).`);
      return loginPage({
        login,
        error: `Слишком много попыток. Попробуйте через ${minutes(left)} мин.`,
      });
    }

    const admin = getAdminByLogin(login);
    // Пароль проверяем даже при несуществующем логине, чтобы по времени ответа
    // нельзя было понять, какой логин настоящий.
    const ok = admin
      ? await verifyPassword(password, admin.password_hash)
      : await verifyPassword(password, 'scrypt$16384$8$1$00$00');

    if (!ok) {
      const rec = noteFailure(ip);
      req.log.warn(`Панель: неудачный вход с ${ip}, логин «${login}» (попытка ${rec.count}).`);
      return loginPage({ login, error: 'Неверный логин или пароль.' });
    }

    noteSuccess(ip);
    const { token } = createSession(admin.id);
    reply.header('set-cookie', sessionCookie(token, config.admin.sessionDays * 24 * 3600));
    req.log.info(`Панель: вход выполнен, логин «${admin.login}», ${ip}.`);
    return reply
      .code(303)
      .header('location', admin.must_change_password ? '/admin/password' : '/admin')
      .send();
  });

  app.post('/logout', async (req, reply) => {
    // CSRF здесь не проверяем через readForm: выход ничего не портит, а токен
    // в форме всё равно есть. Достаточно того, что запрос пришёл со своего сайта
    // (проверка Origin в общем хуке) и что мы просто гасим сессию.
    const token = readCookie(req, COOKIE_NAME);
    destroySession(token);
    reply.header('set-cookie', clearCookie());
    req.log.info(`Панель: выход, логин «${req.adminUser?.login ?? '—'}».`);
    return reply.code(303).header('location', '/admin/login?ok=' + encodeURIComponent('Вы вышли из панели')).send();
  });

  app.get('/password', async (req, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    const forced = !!req.adminUser.must_change_password;
    return layout({
      title: 'Смена пароля',
      active: '/admin/password',
      query: req.query,
      csrf: req.adminSession.csrf,
      body: card(
        `
        ${h1('Смена пароля')}
        ${
          forced
            ? '<p class="flash flash--err">Это первый вход. Задайте свой пароль — тот, что выдали при настройке, знает не только вы.</p>'
            : ''
        }
        <p class="muted">Логин: ${req.adminUser.login}. После смены пароля все другие входы завершатся — на телефоне и компьютере нужно будет войти заново.</p>
        ${form({
          action: '/admin/password',
          csrf: req.adminSession.csrf,
          submit: 'Сменить пароль',
          body: [
            input({
              name: 'current',
              label: 'Текущий пароль',
              type: 'password',
              required: true,
              autocomplete: 'current-password',
            }),
            input({
              name: 'next',
              label: 'Новый пароль',
              type: 'password',
              required: true,
              autocomplete: 'new-password',
              hint: `Не короче ${MIN_PASSWORD_LENGTH} символов`,
            }),
            input({
              name: 'repeat',
              label: 'Новый пароль ещё раз',
              type: 'password',
              required: true,
              autocomplete: 'new-password',
            }),
          ].join(''),
        })}
      `,
        'card--narrow'
      ),
    });
  });

  app.post(
    '/password',
    guard('/admin/password', async (req, reply) => {
      const { fields } = await readForm(req);
      const current = String(fields.current ?? '');
      const next = String(fields.next ?? '');
      const repeat = String(fields.repeat ?? '');

      if (!(await verifyPassword(current, req.adminUser.password_hash))) {
        throw new FormError('Текущий пароль введён неверно');
      }
      if (next.length < MIN_PASSWORD_LENGTH) {
        throw new FormError(`Новый пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`);
      }
      if (next !== repeat) throw new FormError('Новые пароли не совпадают');
      if (next === current) throw new FormError('Новый пароль совпадает со старым');

      await changePassword(req.adminUser.id, next, readCookie(req, COOKIE_NAME));
      req.log.info(`Панель: пароль изменён, логин «${req.adminUser.login}».`);
      return redirect(reply, '/admin', { ok: 'Пароль изменён. Остальные входы завершены.' });
    })
  );
}
