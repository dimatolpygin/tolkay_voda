#!/bin/sh
set -e

: "${ICECAST_SOURCE_PASSWORD:?нужно задать ICECAST_SOURCE_PASSWORD}"
: "${ICECAST_ADMIN_PASSWORD:?нужно задать ICECAST_ADMIN_PASSWORD}"
export ICECAST_SOURCE_PASSWORD ICECAST_ADMIN_PASSWORD

# Подставляем пароли из окружения в конфиг (секреты не хранятся в образе).
envsubst '${ICECAST_SOURCE_PASSWORD} ${ICECAST_ADMIN_PASSWORD}' \
  < /etc/icecast.xml.tmpl > /etc/icecast.xml

mkdir -p /var/log/icecast
exec icecast -c /etc/icecast.xml
