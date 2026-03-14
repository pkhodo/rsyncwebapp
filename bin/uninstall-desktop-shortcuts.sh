#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This uninstaller is for macOS only."
  exit 1
fi

DESKTOP_DIR="${HOME}/Desktop"

rm -f \
  "${DESKTOP_DIR}/Rsync Web App Start.command" \
  "${DESKTOP_DIR}/Rsync Web App Stop.command" \
  "${DESKTOP_DIR}/Rsync Web App Status.command"

echo "Removed Rsync Web App desktop shortcuts from ${DESKTOP_DIR}"
