# Лёгкий образ под сервер 2 ядра / 2 ГБ. Node 24 — встроенный node:sqlite
# стабилен без флагов (используется в src/lib/db.js), нативных зависимостей нет.
FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

# Сначала манифесты — кешируем слой с зависимостями.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Исходники (фронт + бэкенд). Что не нужно в образе — в .dockerignore.
COPY . .

# БД-файл живёт в volume, каталог создаётся при старте (db.js mkdir),
# но заранее обозначим точку монтирования.
VOLUME ["/app/data"]

EXPOSE 3000

# Healthcheck через встроенный fetch (Node 24) — без curl/wget в образе.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
