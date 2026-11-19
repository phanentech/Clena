#!/usr/bin/env bash
# Runs the database test suite against a throwaway local PostgreSQL.
# Uses $TEST_DATABASE_URL if set (e.g. a local `supabase start` database),
# otherwise boots the PostgreSQL binary bundled with the embedded-postgres dev dependency.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  exec npx vitest run tests/db
fi

BIN="$(pwd)/node_modules/@embedded-postgres/linux-x64/native/bin"
[[ -d "$BIN" ]] || BIN="$(dirname "$(find node_modules/@embedded-postgres -name initdb -type f | head -1)")"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUN=()
if [[ "$(id -u)" == "0" ]]; then  # postgres refuses to run as root
  id pgtest &>/dev/null || useradd -M pgtest
  chown pgtest "$DATA"; RUN=(runuser -u pgtest --)
fi
"${RUN[@]}" "$BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"${RUN[@]}" "$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/pg.log" -w start >/dev/null
trap '"${RUN[@]}" "$BIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null; rm -rf "$DATA"' EXIT
TEST_DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/postgres" npx vitest run tests/db
