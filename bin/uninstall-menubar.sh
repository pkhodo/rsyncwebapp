#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This uninstaller is for macOS only."
  exit 1
fi

APP_DIR="${HOME}/Applications/RsyncWebAppMenuBar.app"
AGENT_LABEL="local.rsyncwebapp.menubar"
AGENT_FILE="${HOME}/Library/LaunchAgents/${AGENT_LABEL}.plist"

launchctl unload "${AGENT_FILE}" >/dev/null 2>&1 || true
rm -f "${AGENT_FILE}"
rm -rf "${APP_DIR}"

echo "Removed menu bar app and launch agent (${AGENT_LABEL})."
