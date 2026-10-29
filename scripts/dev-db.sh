#!/usr/bin/env bash
# Starts a throwaway local Postgres 16 cluster for development and tests (no Docker needed).
# Usage: scripts/dev-db.sh start|stop   (data dir defaults to /var/tmp/qanunhub-pgdata, port 55432)
set -euo pipefail
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DATA=${PGDATA_DIR:-/var/tmp/qanunhub-pgdata}
PORT=${PGPORT:-55432}
RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="runuser -u postgres --"; fi
case "${1:-start}" in
  start)
    if [ ! -f "$DATA/PG_VERSION" ]; then
      mkdir -p "$DATA"; [ -n "$RUN_AS" ] && chown postgres "$DATA"
      $RUN_AS "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
    fi
    $RUN_AS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/server.log" -w start >/dev/null
    for db in qanunhub qanunhub_test; do
      $RUN_AS psql -h /tmp -p "$PORT" -U postgres -tc "select 1 from pg_database where datname='$db'" | grep -q 1 || \
        $RUN_AS psql -h /tmp -p "$PORT" -U postgres -c "create database $db" >/dev/null
    done
    echo "postgres://postgres@localhost:$PORT/qanunhub"
    ;;
  stop)
    $RUN_AS "$PGBIN/pg_ctl" -D "$DATA" -w stop >/dev/null && echo stopped
    ;;
esac
