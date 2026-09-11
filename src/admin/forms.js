// Чтение форм панели и одинаковые ответы на ошибки.
//
// Любой POST проходит через readForm, и он же сверяет CSRF-токен: так проверку
// нельзя забыть в отдельном обработчике. Обычные формы приходят urlencoded,
// формы с файлами — multipart, читаются одинаково.
import { csrfOk } from './auth.js';

export class FormError extends Error {
  constructor(message, code = 400) {
    super(message);
    this.name = 'FormError';
    this.code = code;
  }
}

// Возвращает { fields, files }. files[name] = { buffer, filename, mimetype }.
// Пустой input type=file (файл не выбран) в files не попадает.
export async function readForm(req) {
  let fields = {};
  const files = {};

  if (typeof req.isMultipart === 'function' && req.isMultipart()) {
    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          if (part.filename && buffer.length) {
            files[part.fieldname] = { buffer, filename: part.filename, mimetype: part.mimetype };
          }
        } else {
          fields[part.fieldname] = part.value;
        }
      }
    } catch (err) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new FormError('Файл слишком большой: mp3 — до 50 МБ, картинка — до 8 МБ', 413);
      }
      throw err;
    }
  } else {
    fields = req.body && typeof req.body === 'object' ? req.body : {};
  }

  if (!csrfOk(req.adminSession, fields._csrf)) {
    throw new FormError('Форма устарела — обновите страницу и повторите', 403);
  }
  return { fields, files };
}

export const str = (fields, name, max = 10000) => String(fields?.[name] ?? '').trim().slice(0, max);

// Редирект после POST (303): обновление страницы не повторяет отправку формы.
export function redirect(reply, path, msg) {
  const qs = msg?.ok
    ? `?ok=${encodeURIComponent(msg.ok)}`
    : msg?.err
      ? `?err=${encodeURIComponent(msg.err)}`
      : '';
  return reply.code(303).header('location', path + qs).send();
}

// Единая обёртка для обработчиков POST: ошибку показываем на той же странице,
// а не белым экраном 500 — клиент правит сайт с телефона и стектрейс ему не нужен.
export function guard(backPath, handler) {
  return async function wrapped(req, reply) {
    try {
      return await handler(req, reply);
    } catch (err) {
      const known = err instanceof FormError;
      const back = typeof backPath === 'function' ? backPath(req) : backPath;
      req.log.error(
        { err },
        `Панель: ошибка обработки формы ${req.method} ${req.url} — ${err.message}`
      );
      return redirect(reply, back, { err: known ? err.message : `Не получилось: ${err.message}` });
    }
  };
}
