# Эфир радио «Толкай Вода».
# Бесконечный перемешанный плейлист → один MP3 128k поток в Icecast.
#
# ВРЕМЕННОЕ РЕШЕНИЕ (2026-06-24): источник аудио — ЛОКАЛЬНЫЙ кэш на диске
# (том /audio, наполняется приложением из S3). Раньше тянули с CDN Beget на лету,
# но CDN периодически отдаёт 523 «Origin unreachable» и эфир немеет. Плейлист
# (/playlist/playlist.m3u) содержит локальные пути /audio/*.mp3 (для ещё не
# скачанных треков — временно CDN-URL как подстраховку). Подробнее: CLAUDE.md.

# Пароль источника и хост Icecast — из окружения (см. .env / docker-compose).
icecast_password = environment.get("ICECAST_SOURCE_PASSWORD")
icecast_host = environment.get("ICECAST_HOST")
icecast_host = if icecast_host == "" then "icecast" else icecast_host end

# Плейлист CDN-URL из общего тома /playlist (приложение генерирует его из БД).
# randomize — перемешивать; watch — перечитывать файл при изменении (добавление/
# удаление песни через бота попадает в эфир без рестарта).
music = playlist(
  mode="randomize",
  reload_mode="watch",
  "/playlist/playlist.m3u"
)

# Мягкие переходы между треками — как на радио.
music = crossfade(fade_in=0.3, fade_out=2.0, duration=3.0, music)

# Бесконечный непрерывный источник: если трек недоступен — поток не падает (тишина).
radio = mksafe(music)

# Один поток 128k MP3. Метаданные «сейчас играет» уходят в Icecast (ICY)
# автоматически из annotate-тегов плейлиста.
output.icecast(
  %mp3(bitrate=128),
  host=icecast_host,
  port=8000,
  password=icecast_password,
  mount="stream",
  name="Радио Толкай Вода",
  description="Круглосуточный эфир клана Толкай Вода",
  genre="Folk",
  url="https://tolkay-voda.ru",
  radio
)
