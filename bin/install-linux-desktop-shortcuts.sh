#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "This installer is for Linux only."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="${HOME}/Desktop"
APP_DIR="${HOME}/.local/share/applications"
PORT="${RSYNC_WEBAPP_PORT:-8787}"

mkdir -p "${DESKTOP_DIR}" "${APP_DIR}"

create_entry() {
  local target="$1"
  local name="$2"
  local exec_line="$3"
  cat > "${target}" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=${name}
Comment=Rsync Web App shortcut
Exec=${exec_line}
Terminal=true
Icon=utilities-terminal
Categories=Utility;
EOF
  chmod +x "${target}"
}

create_entry \
  "${DESKTOP_DIR}/Rsync Web App Start.desktop" \
  "Rsync Web App Start" \
  "/bin/bash -lc 'cd \"${ROOT_DIR}\" && ./bin/start-ui.sh && ./bin/open-ui.sh'"

create_entry \
  "${DESKTOP_DIR}/Rsync Web App Stop.desktop" \
  "Rsync Web App Stop" \
  "/bin/bash -lc 'cd \"${ROOT_DIR}\" && ./bin/stop-ui.sh'"

create_entry \
  "${DESKTOP_DIR}/Rsync Web App Status.desktop" \
  "Rsync Web App Status" \
  "/bin/bash -lc 'cd \"${ROOT_DIR}\" && ./bin/status-ui.sh; read -n 1 -s -r -p \"Press any key to close...\"; echo'"

create_entry \
  "${APP_DIR}/rsync-web-app.desktop" \
  "Rsync Web App" \
  "/bin/bash -lc 'cd \"${ROOT_DIR}\" && ./bin/start-ui.sh && ./bin/open-ui.sh'"

echo "Installed Linux desktop shortcuts."
echo "UI URL: http://rsync.localhost:${PORT}"
