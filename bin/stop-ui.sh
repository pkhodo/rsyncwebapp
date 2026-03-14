#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="${ROOT_DIR}/state/rsync-webapp.pid"
PORT="${RSYNC_WEBAPP_PORT:-8787}"
AGENT_LABEL="local.rsyncwebapp.control"
AGENT_FILE="${HOME}/Library/LaunchAgents/${AGENT_LABEL}.plist"

if [ -f "${AGENT_FILE}" ]; then
  launchctl unload "${AGENT_FILE}" >/dev/null 2>&1 || true
fi

if [ -f "${PID_FILE}" ]; then
  PID="$(cat "${PID_FILE}")"
  if ps -p "${PID}" >/dev/null 2>&1; then
    kill "${PID}" >/dev/null 2>&1 || true
    sleep 1
    if ps -p "${PID}" >/dev/null 2>&1; then
      kill -9 "${PID}" >/dev/null 2>&1 || true
    fi
    echo "Stopped Rsync Web App (PID ${PID})."
  else
    echo "PID ${PID} not running; cleaned stale PID file."
  fi
  rm -f "${PID_FILE}"
fi

if lsof -ti "tcp:${PORT}" >/dev/null 2>&1; then
  lsof -ti "tcp:${PORT}" | xargs -r kill >/dev/null 2>&1 || true
  sleep 1
  if lsof -ti "tcp:${PORT}" >/dev/null 2>&1; then
    lsof -ti "tcp:${PORT}" | xargs -r kill -9 >/dev/null 2>&1 || true
  fi
fi

echo "Rsync Web App stop sequence complete."
