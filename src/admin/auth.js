// Авторизация панели: пароль, сессии, CSRF, защита от перебора.
//
// Пароль хешируется scrypt из node:crypto — без новых зависимостей, в том же духе,
// что выбор node:sqlite вместо better-sqlite3. Сами пароли нигде не хранятся и не
// логируются: в БД только хеш, в cookie — случайный токен, в БД от него sha256.
import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import { db } from '../lib/db.js';
import { config, isProd } from '../lib/config.js';
import { logger } from '../lib/logger.js';

const scrypt = promisify(scryptCb);

// N=16384 — около 100 мс и 16 МБ на проверку. Для одного администратора это
// незаметно, а перебор делает бессмысленным. Сервер одноядерный, поэтому
// считаем асинхронно (scrypt уходит в пул потоков и не блокирует эфир).
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export const COOKIE_NAME = 'tv_admin';
export const MIN_PASSWORD_LENGTH = 8;

// --- Пароль -------------------------------------------------------------

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltHex, keyHex] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(expected, actual);
  } catch {
    return false; // битая строка в БД — считаем, что пароль не подошёл
  }
}

// --- Аккаунты -----------------------------------------------------------

const countAdmins = db.prepare('SELECT COUNT(*) AS n FROM admins');
const adminByLogin = db.prepare('SELECT * FROM admins WHERE login = ?');
const adminById = db.prepare('SELECT * FROM admins WHERE id = ?');
const insertAdmin = db.prepare(
  'INSERT INTO admins (login, password_hash, must_change_password) VALUES (?, ?, ?)'
);
const updatePassword = db.prepare(
  'UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE id = ?'
);

export const getAdminByLogin = (login) => adminByLogin.get(String(login || '').trim()) ?? null;
export const getAdminById = (id) => adminById.get(Number(id)) ?? null;
export const hasAdmins = () => countAdmins.get().n > 0;

// Заводит первый аккаунт из ADMIN_LOGIN/ADMIN_PASSWORD. Вызывается при старте.
// Повторно ничего не создаёт: как только аккаунт есть, .env больше не читается,
// и смена пароля в панели не откатывается следующим деплоем.
export async function ensureSeedAdmin() {
  if (hasAdmins()) return null;
  const { login, password } = config.admin;
  if (!login || !password) {
    logger.warn(
      'ADMIN_LOGIN/ADMIN_PASSWORD не заданы — в панель /admin зайти будет некому. Заполните .env и перезапустите.'
    );
    return null;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    logger.warn(`ADMIN_PASSWORD короче ${MIN_PASSWORD_LENGTH} символов — аккаунт панели не создан.`);
    return null;
  }
  insertAdmin.run(login, await hashPassword(password), 1);
  logger.info(`Аккаунт панели создан из .env: логин «${login}». На первом входе попросим сменить пароль.`);
  return getAdminByLogin(login);
}

// Смена пароля. Все прочие сессии обрываем: пароль меняют в том числе потому,
// что прежний мог утечь.
export async function changePassword(adminId, newPassword, keepToken) {
  updatePassword.run(await hashPassword(newPassword), Number(adminId));
  dropOtherSessions.run(Number(adminId), sha256(keepToken || ''));
}

// --- Сессии -------------------------------------------------------------

const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

const insertSession = db.prepare(
  'INSERT INTO admin_sessions (token_hash, admin_id, csrf, expires_at) VALUES (?, ?, ?, ?)'
);
const sessionByHash = db.prepare(
  "SELECT * FROM admin_sessions WHERE token_hash = ? AND expires_at > datetime('now')"
);
const dropSession = db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?');
const dropOtherSessions = db.prepare(
  'DELETE FROM admin_sessions WHERE admin_id = ? AND token_hash <> ?'
);
const dropExpired = db.prepare("DELETE FROM admin_sessions WHERE expires_at <= datetime('now')");

// SQLite сравнивает datetime как строки, поэтому формат тот же, что у datetime('now').
function sqliteDatePlusDays(days) {
  const t = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return t.toISOString().slice(0, 19).replace('T', ' ');
}

export function createSession(adminId) {
  dropExpired.run();
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  insertSession.run(sha256(token), Number(adminId), csrf, sqliteDatePlusDays(config.admin.sessionDays));
  return { token, csrf };
}

export function getSession(token) {
  if (!token) return null;
  const row = sessionByHash.get(sha256(token));
  if (!row) return null;
  const admin = getAdminById(row.admin_id);
  if (!admin) return null;
  return { session: row, admin };
}

export function destroySession(token) {
  if (token) dropSession.run(sha256(token));
}

// --- Cookie -------------------------------------------------------------

// Своего парсера хватает: нужна одна кука, и ради неё тянуть @fastify/cookie
// в проект, который специально держит зависимости на минимуме, незачем.
export function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// Path=/admin — кука не уезжает вместе с запросами за картинками и стилями.
// Secure только в проде: локально панель открывается по http://localhost.
export function sessionCookie(token, maxAgeSec) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/admin',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export const clearCookie = () => sessionCookie('', 0);

// --- CSRF ---------------------------------------------------------------

export function csrfOk(session, sent) {
  const a = Buffer.from(String(session?.csrf || ''));
  const b = Buffer.from(String(sent || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

// --- Защита от перебора -------------------------------------------------

// В памяти процесса: администратор один, перезапуск сервера в руках у нас,
// а не у того, кто подбирает пароль. Отдельная таблица тут не окупается.
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map(); // ip -> { count, until }

export function lockRemainingMs(ip) {
  const rec = attempts.get(ip);
  if (!rec?.until) return 0;
  const left = rec.until - Date.now();
  if (left <= 0) {
    attempts.delete(ip);
    return 0;
  }
  return left;
}

export function noteFailure(ip) {
  const rec = attempts.get(ip) || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) rec.until = Date.now() + LOCK_MS;
  attempts.set(ip, rec);
  return rec;
}

export function noteSuccess(ip) {
  attempts.delete(ip);
}

// Для тестов и ручной разблокировки.
export function resetAttempts() {
  attempts.clear();
}
