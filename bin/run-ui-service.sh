#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${RSYNC_WEBAPP_HOST:-127.0.0.1}"

if [ -n "${RSYNC_WEBAPP_PORT:-}" ]; then
  PORT="${RSYNC_WEBAPP_PORT}"
else
  PORT="$("${ROOT_DIR}/bin/resolve-ui-port.sh")"
fi

cd "${ROOT_DIR}"
exec /usr/bin/env RSYNC_WEBAPP_HOST="${HOST}" RSYNC_WEBAPP_PORT="${PORT}" \
  python3 app/backend/server.py
