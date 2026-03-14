#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${RSYNC_WEBAPP_PORT:-8787}"

"${ROOT_DIR}/bin/start-ui.sh"

URL="http://rsync.localhost:${PORT}"
echo "Opening ${URL}"

if command -v open >/dev/null 2>&1; then
  open "${URL}"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${URL}" >/dev/null 2>&1 &
elif command -v cmd.exe >/dev/null 2>&1; then
  cmd.exe /c start "${URL}" >/dev/null 2>&1
else
  echo "Could not auto-open browser. Open this URL manually: ${URL}"
fi
