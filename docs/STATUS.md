# STATUS — текущее состояние проекта

> **Для Claude и человека**: это первый файл, который читается в новой сессии. После
> прочтения **обязательно** сверить с реальностью: `git tag -l "stage-*"`,
> `git log --oneline -20` — таблица ниже может быть устаревшей.

**Последнее обновление**: 2026-06-22 (этап 14 закрыт — **майлстоун 3 завершён**)
**Текущий этап**: майлстоун 3 (этапы 13–14) закрыт и принят клиентом. Управление фонотекой через бота (добавление + удаление) в проде. Активных задач нет.
**Следующий шаг**: —

---

## Сводка этапов

Легенда: ☐ не начат · 🚧 в работе · ✅ закрыт · ⏸ заблокирован

| # | Этап | Статус | Закрывающий тег | Последний коммит | Дата закрытия |
|---|---|---|---|---|---|
| 0 | Каркас репозитория | ✅ | `stage-0-done` | 8ebee45 | 2026-06-16 |
| 1 | Радио-плеер | ✅ | `stage-1-done` | — | 2026-06-16 |
| 2 | S3/CDN треки | ✅ | `stage-2-done` | — | 2026-06-16 |
| 3 | Прогноз дня | ✅ | `stage-3-done` | — | 2026-06-16 |
| 4 | Блог | ✅ | `stage-4-done` | — | 2026-06-17 |
| 5 | Telegram-бот | ✅ | `stage-5-done` | — | 2026-06-17 |
| 6 | Контакты/футер + шапка | ✅ | `stage-6-done` | — | 2026-06-17 |
| 7 | Адаптив/оптимизация | ✅ | `stage-7-done` | — | 2026-06-17 |
| 8 | Docker/Caddy/CI/CD | ✅ | `stage-8-done` | — | 2026-06-17 |
| 9 | Прод-деплой | ✅ | `stage-9-done` | — | 2026-06-17 |
| | **Майлстоун 2 — пост-MVP правки** | | | | |
| 10 | Редактирование контента (бот) | ✅ | `stage-10-done` | 8b9ce54 | 2026-06-17 |
| 11 | Живой эфир (Icecast+Liquidsoap) | ✅ | `stage-11-done` | e816e34 | 2026-06-18 |
| 12 | SEO под капотом | ✅ | `stage-12-done` | 5fb5c80 | 2026-06-18 |
| | **Майлстоун 3 — управление фонотекой через бота** | | | | |
| 13 | Добавление песен (бот) | ✅ | `stage-13-done` | 77e30d1 | 2026-06-22 |
| 14 | Удаление песен (бот) | ✅ | `stage-14-done` | 9b9b9e0 | 2026-06-22 |

Детальные критерии приёмки каждого этапа — в [`07_ROADMAP.md`](07_ROADMAP.md).

## Активная работа

Майлстоун 3 (13–14) завершён и принят. Управление фонотекой через бота — добавление
(mp3 → S3 → БД → эфир) и удаление (БД + S3 → эфир), без передеплоя. Активной работы нет.
**Ветка**: `dev` (прод-ветка `master`, деплой `/opt/tolkay_voda`).
Прод: https://tolkay-voda.ru — сайт + живой эфир `/stream` (Icecast+Liquidsoap, плейлист
из БД через общий том) + бот @tolkayvodabot (контент + фонотека) + SEO + Яндекс.Метрика.
Прод: https://tolkay-voda.ru — сайт + живой эфир `/stream` (Icecast+Liquidsoap, источник с CDN) +
редактирование контента через бота (`/edit`) + SEO (robots/sitemap/OG/ЧПУ `/blog/:slug`). Бот @tolkayvodabot.
**Ветка**: `dev` (прод-ветка `master`, деплой `/opt/tolkay_voda`)
Прод: https://tolkay-voda.ru (сервер 159.194.201.64, docker-compose: app+caddy+bot, SQLite). Бот @tolkayvodabot.

## Известные блокеры

Нет.

## История закрытий

- 2026-06-22 — Этап 14: Удаление песен через бота — tag stage-14-done — **майлстоун 3 завершён**. `src/lib/s3.js`: `deleteObject(key)` (idempotent, DeleteObjectCommand). Бот: вход «Удалить песню» в меню `/edit` → список треков с пагинацией (8/стр, кнопки ← / →) → выбор → подтверждение → `deleteTrack` (БД) + `deleteObject` (S3, best-effort) → `regeneratePlaylist` (из эфира без рестарта по watch). Защита `countTracks() <= 1` — последнюю песню удалить нельзя (эфир не онемеет). Доступ whitelist, логи на русском. **Де-риск локально (docker, без удаления из прод-S3):** deleteTrack → плейлист 50→49, Liquidsoap сам перечитал (`Reloading playlist`). **Прод (master 9b9b9e0):** деплой без молчания эфира, /stream audio/mpeg, now резолвит «Человечище». **UAT клиента:** удалил «Человечище» через бота → `/api/tracks` снова 50, трека нет; пагинация работает. Тег на прод-коммите.

- 2026-06-22 — Этап 13: Добавление песен через бота — tag stage-13-done — **майлстоун 3, первый этап**. Фонотека переехала из файла `public/assets/tracks.json` в БД (таблица `tracks`, постоянный том `app-data`), чтобы управлять ей через бота без передеплоя. Одноразовый сид при пустой таблице переносит текущие 50 треков из tracks.json (`src/lib/db.js`). Новые модули: `src/lib/tracks-store.js` (CRUD по фонотеке), `src/lib/playlist.js` (`regeneratePlaylist` — пишет `playlist.m3u` из БД, в ICY уходит ASCII-слаг имени файла). `/api/tracks` и резолв «сейчас играет» (`/api/stream/now`) читают из БД. Плейлист пишется в **общий том** `playlist` (app/bot ↔ liquidsoap); `docker-compose.yml`: том + `PLAYLIST_PATH=/playlist/playlist.m3u`, liquidsoap `depends_on app: service_healthy` (на первом деплое app пишет файл до старта liquidsoap), `radio.liq` читает `/playlist/playlist.m3u` (`reload_mode="watch"` → добавление/удаление песни попадает в эфир **без рестарта**). app пересобирает плейлист из БД при старте. `src/bot/media.js`: `uploadTelegramAudio` (mp3 Telegram → S3, ключ `audio/NN-слаг.mp3`). Бот: «Добавить песню» (аудио или файл-документ → название → S3 → БД → перегенерация), доступ whitelist, логи на русском. **Де-риск локально (docker, без бота):** liquidsoap читает плейлист из общего тома, `/stream` → audio/mpeg, ASCII-слаг проходит через ICY (`raw title: 22-veslo-lyubvi` → резолв «Весло любви»), симуляция добавления трека → liquidsoap сам перечитал плейлист (`Reloading playlist with URI /playlist/playlist.m3u`). **Прод (master 77e30d1):** деплой пересоздал контейнеры без молчания эфира (50 треков в БД, /stream audio/mpeg, now «Эзотерическая»). **UAT клиента:** в @tolkayvodabot добавил песню «Человечище» → бот «добавлена (всего 51 треков)», `/api/tracks` = 51, файл `audio/51-chelovechische.mp3` на CDN (HTTP 200), название резолвится из БД.

- 2026-06-22 — Пост-майлстоун правки (вне структуры этапов, по запросам клиента): (1) `fix(radio)` af0dde9 — «сейчас играет» показывает русское название трека: в ICY уходит ASCII-слаг имени файла, бэк резолвит русское название из `tracks.json` (Icecast не доносил кириллицу → раньше всегда «Радио Толкай Вода»). (2) `feat(site)` 31d4962 — Яндекс.Метрика (id 110055063) на всех страницах, файл вебмастера `/yandex_81d3f6a6ae4ddce9.html`. (3) `feat(privacy)` 95b65ab — «Sellme Marketing» в футере и тексте политики → ссылка на https://sellme.pro/. Всё в проде (master d11957b), проверено curl-ом.

- 2026-06-18 — Этап 12: SEO под капотом — tag stage-12-done — **майлстоун 2 завершён**. `public/robots.txt` (allow, disallow /api, ссылка на sitemap). `src/routes/seo.js`: динамический `GET /sitemap.xml` из БД (главная + privacy + все опубликованные статьи как ЧПУ) и серверный маршрут `GET /blog/:slug` — отдаёт `post.html` с подставленными мета статьи (title/description/og/twitter/canonical) + JSON-LD Article (регистрация без префикса, до статики). index.html: canonical + OG/Twitter + JSON-LD RadioStation; privacy.html: canonical + OG. `blog.js` линкует на `/blog/:slug`, `post.js` берёт slug из ЧПУ или `?slug=` (старые ссылки живут), бот даёт ссылку `https://tolkay-voda.ru/blog/<slug>`. Проверено локально (temp БД) и на проде (5fb5c80): robots/sitemap/ЧПУ отдаются, эфир и сайт не затронуты. Превью-карточка при шаринге в Telegram (заголовок+описание) — подтверждено клиентом скрином.

- 2026-06-18 — Этап 11: Живой эфир (Icecast + Liquidsoap) — tag stage-11-done — единый синхронный поток на всех слушателей вместо джукбокса. Liquidsoap (`docker/liquidsoap/radio.liq`, образ savonet/liquidsoap:v2.2.5) тянет треки **с CDN** (плейлист `playlist.m3u` из `tracks.json` через `scripts/gen-stream-playlist.js`, annotate-метаданные), randomize+crossfade+mksafe → один MP3 128k → Icecast (`docker/icecast/`, Alpine, пароли из env через envsubst, changeowner на icecast, CORS, burst-on-connect для быстрого старта с live-точки). Caddy: `handle /stream` → icecast (flush_interval -1). `src/routes/stream.js`: `/api/stream/now` (now-playing из status-json, чистка битых ICY-кириллических метаданных → бренд). `radio.js`: основной режим `<audio src=/stream>` + поллинг now-playing + автофолбэк на джукбокс при недоступном эфире. Проверено на сервере end-to-end: `/stream` отдаёт audio/mpeg, источник подключён, listeners считаются; CPU liquidsoap ~6.7% / 138 МБ, icecast ~2 МБ, запас RAM ~1.2 ГБ. CDN-стоимость ~80 ГБ/мес (~48 ₽), не зависит от числа слушателей. По ходу исправлено: Icecast под root → changeowner; бинд-маунт одного Caddyfile держал старый inode после `git reset` → деплой теперь `--force-recreate caddy` (deploy.yml). Браузерная проверка клиентом — ок («вроде работает»). Прод-коммит e816e34.

- 2026-06-17 — Этап 10: Редактирование контента через бота — tag stage-10-done — в боте появился вход «Редактировать» (кнопка в `/start` + команда `/edit`) → выбор «Прогнозы/Статьи» → список последних 10 записей инлайн-кнопками → меню полей. Статья: заголовок / текст (с пересборкой анонса) / фото. Прогноз: вводка / Вода / Цвет / Еда / Совет / лунный день / фото, плюс «Текст заново (ИИ)» — переработка сырого текста через OpenAI. Удаление — с подтверждением. `src/bot/store.js`: listRecent*/getById/updatePostField/updateForecastField (whitelist колонок — защита от инъекции имён), reprocessForecast, deletePost/deleteForecast; store-функции прогнаны на временной БД (CRUD, whitelist отбивает `slug`). Доступ — существующий whitelist-middleware. Логи правок/удалений на русском (id записи, поле, кто). Дополнительно: меню команд слева через `setMyCommands` (start/edit/help/cancel). Проверено клиентом вживую в проде (@tolkayvodabot) после мержа в master (8b9ce54).

- 2026-06-17 — Этап 9: Прод-деплой (okdeploy) — tag stage-9-done — развёрнут на сервере Music_site `159.194.201.64` (Ubuntu 24.04, 2 ядра / 2 ГБ, +swap 2G). Установлен Docker 29.5.3, склонирован `master` в `/opt/tolkay_voda`, залит `.env` (production, SITE_DOMAIN=tolkay-voda.ru, COMPOSE_PROFILES=bot, секреты S3/BOT/OPENAI). `docker compose up -d --build` поднял app(healthy)+caddy+bot. Caddy выпустил Let's Encrypt-сертификат для apex (DNS apex → IP добавлен клиентом в Beget; зона домена на Beget NS, не reg.ru; n8n на отдельном сервере 31.207.75.17). Проверено: https://tolkay-voda.ru — 200, радио играет с CDN (трек «Це Апрель»), HTTP→HTTPS 308, /api/health ok; бот @tolkayvodabot запущен (long-polling), принял /start от админа; n8n.tolkay-voda.ru — 200 (не затронут). Deploy-ключ ed25519 установлен на сервер (вход CI). Осталось: добавить в GitHub Secrets SSH_HOST/SSH_USER/SSH_KEY и проверить автодеплой пушем в master.

- 2026-06-17 — Этап 8: Docker/Caddy/CI/CD — tag stage-8-done — `Dockerfile` (node:24-slim, `npm ci --omit=dev`, healthcheck через встроенный fetch), `docker-compose.yml` (app + caddy; бот в профиле `bot`, чтобы `up` не падал без BOT_TOKEN; общий volume `app-data` под SQLite, тома `caddy_data`/`caddy_config`), `Caddyfile` (reverse_proxy на app:3000, `SITE_DOMAIN` env: `:80` локально / домен → авто-HTTPS), `.dockerignore`, `.github/workflows/deploy.yml` (push в master → SSH-деплой через appleboy/ssh-action: `git reset --hard origin/master` + `docker compose up -d --build`). Проверено локально: `docker compose up -d --build` поднял app (healthy) + caddy, Caddy отдаёт сайт по HTTP (200 `via: Caddy`), все ассеты/страницы 200, бот-профиль валиден. Архитектура прода: сайт на отдельном сервере, Caddy единолично владеет 80/443, n8n (n8n.tolkay-voda.ru) на своей машине не затрагивается. Живой прогон workflow — на этапе 9 (после okdeploy: сервер, клон репо, secrets SSH_HOST/USER/KEY).

- 2026-06-17 — Этап 7: Адаптив и оптимизация — tag stage-7-done — проверен мобильный вид (Playwright 320/360/390px): фон 9:16, нет горизонтального скролла, навигация и все блоки читаемы/кликабельны. Оптимизация под Lighthouse mobile: критический CSS заинлайнен в `index.html` (убран render-blocking запрос ~1.4с), gzip/brotli-сжатие ответов через `@fastify/compress` (HTML/CSS/JS/JSON), логотип пережат 478px/115KB → 400px/30KB, `aspect-ratio` под фото прогноза (CLS), `loading=lazy`+`decoding=async` и onerror-фолбэк на cover-default для фото блога/прогноза/статьи, `prefers-reduced-motion`. Lighthouse Performance (mobile) 91–95 (цель ≥85), FCP 2.1с, LCP 3.2с, TBT 0, CLS 0.038. `styles.css` остаётся источником правды и грузится на `post.html`/`privacy.html`.

- 2026-06-17 — Этап 6: Контакты/футер + шапка — tag stage-6-done — sticky-навбар (`public/js/nav.js`, меню Радио/Прогноз/Блог/Связь, прозрачный поверх hero → тёмный при скролле, адаптив). Футер: © Sellme Marketing + ссылка на политику (иконки соцсетей — только в секции «Связь», без дубля). Кастомные SVG-иконки Telegram/YouTube/email, mailto radio@tolkay-voda.ru. Страница `public/privacy.html` — политика без сбора ПД (форм нет, требование РКН). post.js рендерит тело статьи абзацами + ## заголовки. Проверено в браузере (Playwright) и клиентом.

- 2026-06-17 — Этап 5: Telegram-бот — tag stage-5-done — grammY-бот с FSM и инлайн-кнопками (`src/bot/`): /start → выбор типа → пошаговый сбор (прогноз: текст → фото; статья: заголовок → текст → фото) → предпросмотр → публикация. Прогноз причёсывает OpenAI gpt-4o-mini (`src/lib/ai.js`) в структуру (лунный день, вводка, Вода/Цвет/Еда/Совет дня, полный текст), есть фолбэк без ключа. Фото Telegram → S3 → CDN. Схема forecast расширена (subtitle/intro/water/color/food/advice). Фронт прогноза по макету, блог — горизонтальная лента со scroll-snap. whitelist + pino-логи на русском. Проверено клиентом вживую (прогноз с фото, статья, лента). Конфиг: BOT_TOKEN, BOT_ADMIN_IDS, OPENAI_API_KEY.

- 2026-06-17 — Этап 4: Блог — tag stage-4-done — сетка статей с пагинацией (`public/js/blog.js`), отдельная страница статьи (`public/post.html` + `public/js/post.js`, фото/заголовок/дата/тело, обработка 404). API `/posts?page=` и `/posts/:slug` с этапа 0. Демо-статьи через `npm run seed:posts` (11 шт, 2 страницы), фото — плейсхолдер до этапа 5. Проверено в браузере (Playwright) и клиентом.

- 2026-06-16 — Этап 3: Прогноз дня — tag stage-3-done — блок «Прогноз дня» на главной по макету (заголовок, дата на русском, разделы Вода/Цвет/Еда/Совет дня, фото), модалка «Читать полный прогноз» (закрытие Esc/клик вне/крестик). API `/forecast/today` (последний доступный) + `/forecast/:id` с этапа 0. Демо-запись через `npm run seed:forecast` (идемпотентно), фото — плейсхолдер до этапа 5 (бот зальёт реальные). Проверено в браузере (Playwright) и клиентом.

- 2026-06-16 — Этап 2: S3/CDN треки — tag stage-2-done — 50 mp3 залиты на S3 Beget, раздаются с CDN (HTTP 200 audio/mpeg, Range, CORS для tolkay-voda.ru). Плеер играет напрямую с CDN (сервер аудио не трогает). Визуализатор адаптивный: реальный спектр частот при открытом CORS, иначе процедурный (звук не глушится). dev берёт /media (tracks.local.json, same-origin), прод — CDN (tracks.json). Проверено клиентом.

- 2026-06-16 — Этап 1: Радио-плеер — tag stage-1-done — главная по макету (2K фон ПК, круглый логотип с залитой «А», шрифты Oswald+Inter self-hosted), плеер случайного трека с автопереходом, canvas-визуализатор (WebAudio + процедурный fallback при CORS), «Сейчас играет». Проверено клиентом вживую. Мобильный фон пока 941×1672 (некритично, заменим если дадут 2K вертикальный).
- 2026-06-16 — Этап 0: Каркас репозитория — tag stage-0-done — Fastify 5 + встроенный node:sqlite (отказ от better-sqlite3 из-за отсутствия VS build tools на Windows; node:sqlite легче и без нативной сборки). API health/tracks/forecast/posts отвечают, `data/app.db` создаётся, статика отдаётся. Проверено curl-ом.

## Протокол обновления

**При старте сессии**:
1. Прочитать этот файл.
2. `git tag -l "stage-*"` и сверить с колонкой «Закрывающий тег».
3. `git log --oneline -10` — что менялось последним.
4. Только после этого приступать к работе.

**При взятии этапа в работу**: обновить «Текущий этап»/«Активная работа», статус 🚧, коммит `chore(status): start stage N`.

**При закрытии этапа**: все чекбоксы `[x]` и проверены → `git tag stage-N-done` → обновить таблицу и «Историю закрытий» → коммит `chore(status): close stage N`.

**Если этап заблокирован**: статус ⏸, описать блокер и что нужно для разблокировки.

## Что НЕ хранится здесь

- Длинные планы — в `07_ROADMAP.md`.
- TODO внутри этапа — таск-лист сессии.
- История кода — `git log`.

Этот файл — снимок состояния по этапам. Помещается на один экран.
