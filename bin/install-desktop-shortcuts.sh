#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS only."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="${HOME}/Desktop"

mkdir -p "${DESKTOP_DIR}"

cat > "${DESKTOP_DIR}/Rsync Web App Start.command" <<EOF
#!/usr/bin/env bash
cd "${ROOT_DIR}"
./bin/start-ui.sh
./bin/open-ui.sh
EOF

cat > "${DESKTOP_DIR}/Rsync Web App Stop.command" <<EOF
#!/usr/bin/env bash
cd "${ROOT_DIR}"
./bin/stop-ui.sh
EOF

cat > "${DESKTOP_DIR}/Rsync Web App Status.command" <<EOF
#!/usr/bin/env bash
cd "${ROOT_DIR}"
./bin/status-ui.sh
read -n 1 -s -r -p "Press any key to close..."
echo
EOF

chmod +x \
  "${DESKTOP_DIR}/Rsync Web App Start.command" \
  "${DESKTOP_DIR}/Rsync Web App Stop.command" \
  "${DESKTOP_DIR}/Rsync Web App Status.command"

echo "Installed desktop shortcuts:"
echo "  - ${DESKTOP_DIR}/Rsync Web App Start.command"
echo "  - ${DESKTOP_DIR}/Rsync Web App Stop.command"
echo "  - ${DESKTOP_DIR}/Rsync Web App Status.command"
