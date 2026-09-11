// Разметка панели. Страницы собираются на сервере обычными строками и работают
// без JavaScript: клиент правит сайт с телефона, иногда на плохой связи, и форма
// не должна зависеть от того, догрузился ли скрипт.
import { AD_SLOTS } from '../lib/ads-store.js';

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// "2026-09-11" / "2026-09-11 12:30:00" → "11.09.2026"
export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || '');
}

export function cut(text, n = 90) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const TABS = [
  ['/admin', 'Главная'],
  ['/admin/forecast', 'Прогноз'],
  ['/admin/posts', 'Статьи'],
  ['/admin/tracks', 'Песни'],
  ['/admin/ads', 'Баннеры'],
  ['/admin/password', 'Пароль'],
];

function tabs(active) {
  return TABS.map(
    ([href, label]) =>
      `<a class="tab${href === active ? ' tab--on' : ''}" href="${href}">${label}</a>`
  ).join('');
}

// Одноразовое сообщение после редиректа. Текст приходит в query и всегда экранируется.
function flash(query) {
  const ok = query?.ok;
  const err = query?.err;
  if (ok) return `<p class="flash flash--ok">${esc(ok)}</p>`;
  if (err) return `<p class="flash flash--err">${esc(err)}</p>`;
  return '';
}

export function layout({ title, active, body, query, csrf, chrome = true }) {
  const head = chrome
    ? `<header class="top">
      <div class="top__in">
        <a class="top__name" href="/admin">Толкай Вода · панель</a>
        <form class="top__out" method="post" action="/admin/logout">
          <input type="hidden" name="_csrf" value="${esc(csrf)}" />
          <button class="btn btn--ghost" type="submit">Выйти</button>
        </form>
      </div>
      <nav class="tabs">${tabs(active)}</nav>
    </header>`
    : '';

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${esc(title)} — панель «Толкай Вода»</title>
  <link rel="icon" href="/assets/img/logo.webp" />
  <link rel="stylesheet" href="/css/admin.css" />
</head>
<body>
  ${head}
  <main class="wrap">
    ${flash(query)}
    ${body}
  </main>
</body>
</html>
`;
}

// --- Кирпичики форм -----------------------------------------------------

export const card = (inner, cls = '') => `<section class="card ${cls}">${inner}</section>`;

export const h1 = (t) => `<h1 class="h1">${esc(t)}</h1>`;
export const h2 = (t) => `<h2 class="h2">${esc(t)}</h2>`;

export function input({ name, label, value = '', type = 'text', hint = '', required = false, ...rest }) {
  const attrs = Object.entries(rest)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(' ');
  return `<label class="fld">
    <span class="fld__lbl">${esc(label)}</span>
    <input class="fld__in" type="${esc(type)}" name="${esc(name)}" value="${esc(value)}"
      ${required ? 'required' : ''} ${attrs} />
    ${hint ? `<span class="fld__hint">${esc(hint)}</span>` : ''}
  </label>`;
}

export function textarea({ name, label, value = '', rows = 8, hint = '', required = false }) {
  return `<label class="fld">
    <span class="fld__lbl">${esc(label)}</span>
    <textarea class="fld__in fld__in--area" name="${esc(name)}" rows="${rows}" ${
      required ? 'required' : ''
    }>${esc(value)}</textarea>
    ${hint ? `<span class="fld__hint">${esc(hint)}</span>` : ''}
  </label>`;
}

// accept без capture: на телефоне пользователь сам выбирает камеру или галерею.
export function fileField({ name, label, accept, hint = '' }) {
  return `<label class="fld">
    <span class="fld__lbl">${esc(label)}</span>
    <input class="fld__in fld__in--file" type="file" name="${esc(name)}" accept="${esc(accept)}" />
    ${hint ? `<span class="fld__hint">${esc(hint)}</span>` : ''}
  </label>`;
}

export const hidden = (name, value) =>
  `<input type="hidden" name="${esc(name)}" value="${esc(value)}" />`;

export function form({ action, csrf, body, submit, multipart = false, cls = '' }) {
  return `<form class="form ${cls}" method="post" action="${esc(action)}"${
    multipart ? ' enctype="multipart/form-data"' : ''
  }>
    ${hidden('_csrf', csrf)}
    ${body}
    <button class="btn btn--gold" type="submit">${esc(submit)}</button>
  </form>`;
}

export const btnLink = (href, text, cls = '') =>
  `<a class="btn ${cls}" href="${esc(href)}">${esc(text)}</a>`;

export const empty = (text) => `<p class="empty">${esc(text)}</p>`;

// --- Страница подтверждения удаления ------------------------------------

export function confirmPage({ question, details, action, csrf, back }) {
  return card(`
    ${h1('Подтверждение')}
    <p class="lead">${esc(question)}</p>
    ${details ? `<p class="muted">${esc(details)}</p>` : ''}
    <div class="row">
      ${form({ action, csrf, body: '', submit: 'Да, удалить', cls: 'form--inline' })}
      ${btnLink(back, 'Отмена', 'btn--ghost')}
    </div>
    <p class="muted">Действие необратимо.</p>
  `);
}

// --- Страница входа -----------------------------------------------------

export function loginPage({ error = '', notice = '', login = '' }) {
  return layout({
    title: 'Вход',
    active: '',
    chrome: false,
    query: {},
    csrf: '',
    body: card(
      `
      ${h1('Панель «Толкай Вода»')}
      ${error ? `<p class="flash flash--err">${esc(error)}</p>` : ''}
      ${notice ? `<p class="flash flash--ok">${esc(notice)}</p>` : ''}
      <form class="form" method="post" action="/admin/login">
        ${input({ name: 'login', label: 'Логин', value: login, required: true, autocomplete: 'username', autocapitalize: 'none' })}
        ${input({ name: 'password', label: 'Пароль', type: 'password', required: true, autocomplete: 'current-password' })}
        <button class="btn btn--gold" type="submit">Войти</button>
      </form>
      <p class="muted">Отсюда меняется всё содержимое сайта. Не передавайте доступ третьим лицам.</p>
    `,
      'card--narrow'
    ),
  });
}

export const AD_SLOT_LIST = AD_SLOTS;
