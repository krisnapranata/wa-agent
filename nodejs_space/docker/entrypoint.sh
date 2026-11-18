#!/bin/sh
# Titik masuk container wabot.
#   web       : API + dashboard + koneksi WhatsApp (tabel internal bot dibuat otomatis saat start)
#   scheduler : broadcast terjadwal (BROADCAST_TIMES) + keepalive, memanggil service web lewat HTTP
#   lainnya   : diteruskan apa adanya, mis. `docker compose run --rm web node -v`
set -e
cd /app

case "${1:-web}" in
  web)
    exec node dist/main.js
    ;;
  scheduler)
    exec node dist/scheduler.js
    ;;
  *)
    exec "$@"
    ;;
esac
