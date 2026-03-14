#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "This installer is for Linux only."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${RSYNC_WEBAPP_PORT:-8787}"
SYSTEMD_DIR="${HOME}/.config/systemd/user"
SERVICE_FILE="${SYSTEMD_DIR}/rsync-webapp.service"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found. Cannot install user service."
  exit 1
fi

mkdir -p "${SYSTEMD_DIR}" "${ROOT_DIR}/state/logs"

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Rsync Web App
After=network.target

[Service]
Type=simple
WorkingDirectory=${ROOT_DIR}
Environment=RSYNC_WEBAPP_HOST=127.0.0.1
Environment=RSYNC_WEBAPP_PORT=${PORT}
ExecStart=/usr/bin/env python3 app/backend/server.py
Restart=always
RestartSec=3
StandardOutput=append:${ROOT_DIR}/state/logs/systemd.out.log
StandardError=append:${ROOT_DIR}/state/logs/systemd.err.log

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now rsync-webapp.service

echo "Installed systemd user service: rsync-webapp.service"
echo "UI URL: http://rsync.localhost:${PORT}"
