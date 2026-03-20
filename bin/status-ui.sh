#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="${ROOT_DIR}/state/rsync-webapp.pid"
PORT="$("${ROOT_DIR}/bin/resolve-ui-port.sh")"
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
  for p in ${PIDS}; do
    CWD="$(lsof -a -p "${p}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n1)"
    if [ "${CWD}" = "${ROOT_DIR}" ]; then
      TAG="current-repo"
    else
      TAG="foreign-repo"
    fi
    echo "  PID ${p} cwd=${CWD:-unknown} (${TAG})"
  done
  if [ -f "${AGENT_FILE}" ]; then
    if [ "${AGENT_MATCHES_REPO}" = "1" ]; then
      if grep -Fq "run-ui-service.sh" "${AGENT_FILE}"; then
        echo "LaunchAgent: installed (${AGENT_LABEL}, auto-port)"
      else
        echo "LaunchAgent: installed but outdated (fixed-port mode)"
      fi
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
    PORT_FROM_PID="$(lsof -nP -a -p "${PID}" -iTCP -sTCP:LISTEN -Fn 2>/dev/null | sed -n 's/.*:\([0-9]\+\)$/\1/p' | head -n1)"
    ACTIVE_PORT="${PORT_FROM_PID:-${PORT}}"
    echo "Rsync Web App: running (PID ${PID})"
    echo "URL: http://rsync.localhost:${ACTIVE_PORT}"
    exit 0
  fi
  echo "Rsync Web App: stale PID file (${PID})"
  exit 1
fi

echo "Rsync Web App: not running"
exit 1
