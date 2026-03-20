#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="${ROOT_DIR}/state"
PORT_FILE="${STATE_DIR}/ui-port"
DEFAULT_PORT="${RSYNC_WEBAPP_DEFAULT_PORT:-8787}"
RANGE_START="${RSYNC_WEBAPP_PORT_RANGE_START:-8700}"
RANGE_END="${RSYNC_WEBAPP_PORT_RANGE_END:-9499}"

is_valid_port() {
  local value="${1:-}"
  [[ "${value}" =~ ^[0-9]+$ ]] || return 1
  [ "${value}" -ge 1 ] && [ "${value}" -le 65535 ]
}

listener_pids_for_port() {
  local port="$1"
  lsof -ti "tcp:${port}" 2>/dev/null | sort -u
}

pid_cwd() {
  local pid="$1"
  lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n1
}

port_available_for_repo() {
  local port="$1"
  local any="0"
  while IFS= read -r pid; do
    [ -z "${pid}" ] && continue
    any="1"
    if [ "$(pid_cwd "${pid}")" = "${ROOT_DIR}" ]; then
      return 0
    fi
  done < <(listener_pids_for_port "${port}")
  [ "${any}" = "0" ]
}

repo_seed_port() {
  local span seed
  span=$((RANGE_END - RANGE_START + 1))
  if [ "${span}" -le 0 ]; then
    echo "${DEFAULT_PORT}"
    return
  fi
  seed="$(printf '%s' "${ROOT_DIR}" | cksum | awk '{print $1}')"
  echo $((RANGE_START + (seed % span)))
}

add_candidate() {
  local value="$1"
  [ -n "${value}" ] || return 0
  is_valid_port "${value}" || return 0
  case " ${CANDIDATES} " in
    *" ${value} "*) ;;
    *) CANDIDATES="${CANDIDATES} ${value}" ;;
  esac
}

CANDIDATES=""

if [ -n "${RSYNC_WEBAPP_PORT:-}" ]; then
  add_candidate "${RSYNC_WEBAPP_PORT}"
fi

if [ -f "${PORT_FILE}" ]; then
  SAVED_PORT="$(tr -d '[:space:]' < "${PORT_FILE}")"
  add_candidate "${SAVED_PORT}"
fi

SEED_PORT="$(repo_seed_port)"
add_candidate "${SEED_PORT}"
add_candidate "${DEFAULT_PORT}"

span=$((RANGE_END - RANGE_START + 1))
if [ "${span}" -gt 0 ]; then
  offset=0
  while [ "${offset}" -lt "${span}" ]; do
    port=$((RANGE_START + ((SEED_PORT - RANGE_START + offset) % span)))
    add_candidate "${port}"
    offset=$((offset + 1))
  done
fi

SELECTED_PORT=""
for port in ${CANDIDATES}; do
  if port_available_for_repo "${port}"; then
    SELECTED_PORT="${port}"
    break
  fi
done

if [ -z "${SELECTED_PORT}" ]; then
  echo "Could not find a free UI port in ${RANGE_START}-${RANGE_END}." >&2
  exit 1
fi

mkdir -p "${STATE_DIR}"
printf '%s\n' "${SELECTED_PORT}" > "${PORT_FILE}"
echo "${SELECTED_PORT}"
