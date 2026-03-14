#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="${ROOT_DIR}/state/rsync-webapp.pid"
PORT="${RSYNC_WEBAPP_PORT:-8787}"
AGENT_LABEL="local.rsyncwebapp.control"
AGENT_FILE="${HOME}/Library/LaunchAgents/${AGENT_LABEL}.plist"

if lsof -ti "tcp:${PORT}" >/dev/null 2>&1; then
  PID="$(lsof -ti "tcp:${PORT}" | head -1)"
  echo "Rsync Web App: running (PID ${PID})"
  if [ -f "${AGENT_FILE}" ]; then
    echo "LaunchAgent: installed (${AGENT_LABEL})"
  fi
  echo "URL: http://rsync.localhost:${PORT}"
  exit 0
fi

if [ -f "${PID_FILE}" ]; then
  PID="$(cat "${PID_FILE}")"
  if ps -p "${PID}" >/dev/null 2>&1; then
    echo "Rsync Web App: running (PID ${PID})"
    echo "URL: http://rsync.localhost:${PORT}"
    exit 0
  fi
  echo "Rsync Web App: stale PID file (${PID})"
  exit 1
fi

echo "Rsync Web App: not running"
exit 1
