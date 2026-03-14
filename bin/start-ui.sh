#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="${ROOT_DIR}/state"
LOG_DIR="${STATE_DIR}/logs"
PID_FILE="${STATE_DIR}/rsync-webapp.pid"
APP_LOG="${LOG_DIR}/app.log"
FRONTEND_INDEX="${ROOT_DIR}/app/frontend/dist/index.html"
AGENT_LABEL="local.rsyncwebapp.control"
AGENT_FILE="${HOME}/Library/LaunchAgents/${AGENT_LABEL}.plist"

HOST="${RSYNC_WEBAPP_HOST:-127.0.0.1}"
PORT="${RSYNC_WEBAPP_PORT:-8787}"

mkdir -p "${LOG_DIR}"

if [ ! -f "${FRONTEND_INDEX}" ]; then
  echo "Frontend bundle missing: ${FRONTEND_INDEX}"
  echo "Build it first: npm install && npm run build:frontend"
  exit 1
fi

if lsof -ti "tcp:${PORT}" >/dev/null 2>&1; then
  echo "Rsync Web App already running on port ${PORT}"
  echo "URL: http://rsync.localhost:${PORT}"
  exit 0
fi

agent_matches_repo="0"
if [ -f "${AGENT_FILE}" ] && grep -Fq "${ROOT_DIR}" "${AGENT_FILE}"; then
  agent_matches_repo="1"
fi

if [ -f "${AGENT_FILE}" ]; then
  if [ "${agent_matches_repo}" = "1" ]; then
    launchctl load "${AGENT_FILE}" >/dev/null 2>&1 || true
    launchctl kickstart -k "gui/$(id -u)/${AGENT_LABEL}" >/dev/null 2>&1 || true
    sleep 1
    if lsof -ti "tcp:${PORT}" >/dev/null 2>&1; then
      echo "Rsync Web App started via LaunchAgent (${AGENT_LABEL})"
      echo "URL: http://rsync.localhost:${PORT}"
      exit 0
    fi
  else
    echo "LaunchAgent exists but points to a different repo path."
    echo "Run ./bin/install-launchagent.sh to rebind it to this checkout."
  fi
fi

if [ -f "${PID_FILE}" ]; then
  PID="$(cat "${PID_FILE}")"
  if ps -p "${PID}" >/dev/null 2>&1; then
    echo "Rsync Web App already running (PID ${PID})"
    echo "URL: http://rsync.localhost:${PORT}"
    exit 0
  fi
  rm -f "${PID_FILE}"
fi

cd "${ROOT_DIR}"
RSYNC_WEBAPP_HOST="${HOST}" RSYNC_WEBAPP_PORT="${PORT}" \
  nohup python3 app/backend/server.py >>"${APP_LOG}" 2>&1 &
APP_PID=$!
echo "${APP_PID}" > "${PID_FILE}"

sleep 1
PID="$(cat "${PID_FILE}")"
if ps -p "${PID}" >/dev/null 2>&1; then
  echo "Rsync Web App started (PID ${PID})"
  echo "URL: http://rsync.localhost:${PORT}"
else
  echo "Failed to start Rsync Web App. Check ${APP_LOG}"
  exit 1
fi
