# Icecast 2 на Alpine — раздаёт единый эфир всем слушателям.
# Конфиг — шаблон с подстановкой паролей из окружения при старте (envsubst).
FROM alpine:3.20

RUN apk add --no-cache icecast gettext

COPY icecast.xml /etc/icecast.xml.tmpl
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
