#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="${ROOT_DIR}/state/rsync-webapp.pid"
PORT="${RSYNC_WEBAPP_PORT:-8787}"
AGENT_LABEL="local.rsyncwebapp.control"
AGENT_FILE="${HOME}/Library/LaunchAgents/${AGENT_LABEL}.plist"
AGENT_MATCHES_REPO="0"
if [ -f "${AGENT_FILE}" ] && grep -Fq "${ROOT_DIR}" "${AGENT_FILE}"; then
  AGENT_MATCHES_REPO="1"
fi

if lsof -ti "tcp:${PORT}" >/dev/null 2>&1; then
  PIDS="$(lsof -ti "tcp:${PORT}" | sort -u | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  COUNT="$(echo "${PIDS}" | wc -w | tr -d ' ')"
  PID="$(echo "${PIDS}" | awk '{print $1}')"
  echo "Rsync Web App: running (PID ${PID})"
  echo "Port listeners (${PORT}): ${COUNT} -> ${PIDS}"
  if [ -f "${AGENT_FILE}" ]; then
    if [ "${AGENT_MATCHES_REPO}" = "1" ]; then
      echo "LaunchAgent: installed (${AGENT_LABEL})"
    else
      echo "LaunchAgent: installed but points to a different repo path"
    fi
  fi
  echo "URL: http://rsync.localhost:${PORT}"
  if [ "${COUNT}" -gt 1 ]; then
    echo "Warning: multiple listeners detected. Stop extras with ./bin/stop-ui.sh"
  fi
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
