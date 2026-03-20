#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="${ROOT_DIR}/state/rsync-webapp.pid"
PORT="$("${ROOT_DIR}/bin/resolve-ui-port.sh")"
AGENT_LABEL="local.rsyncwebapp.control"
AGENT_FILE="${HOME}/Library/LaunchAgents/${AGENT_LABEL}.plist"

pid_cwd() {
  local pid="$1"
  lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n1
}

is_repo_server_pid() {
  local pid="$1"
  local cwd cmd
  cwd="$(pid_cwd "${pid}")"
  [ "${cwd}" = "${ROOT_DIR}" ] || return 1
  cmd="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
  [[ "${cmd}" == *"app/backend/server.py"* ]]
}

stop_pid() {
  local pid="$1"
  kill "${pid}" >/dev/null 2>&1 || true
  sleep 1
  if ps -p "${pid}" >/dev/null 2>&1; then
    kill -9 "${pid}" >/dev/null 2>&1 || true
  fi
}

if [ -f "${AGENT_FILE}" ] && grep -Fq "${ROOT_DIR}" "${AGENT_FILE}"; then
  launchctl unload "${AGENT_FILE}" >/dev/null 2>&1 || true
fi

if [ -f "${PID_FILE}" ]; then
  PID="$(cat "${PID_FILE}")"
  if ps -p "${PID}" >/dev/null 2>&1 && is_repo_server_pid "${PID}"; then
    stop_pid "${PID}"
    echo "Stopped Rsync Web App (PID ${PID})."
  else
    echo "PID ${PID} not running; cleaned stale PID file."
  fi
  rm -f "${PID_FILE}"
fi

if lsof -ti "tcp:${PORT}" >/dev/null 2>&1; then
  while IFS= read -r pid; do
    [ -z "${pid}" ] && continue
    if is_repo_server_pid "${pid}"; then
      stop_pid "${pid}"
      echo "Stopped listener PID ${pid} on port ${PORT}."
    fi
  done < <(lsof -ti "tcp:${PORT}" 2>/dev/null | sort -u)
fi

echo "Rsync Web App stop sequence complete."
