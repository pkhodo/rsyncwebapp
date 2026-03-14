#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS only."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_FILE="${ROOT_DIR}/app/menubar/RsyncWebAppMenuBar.swift"
APP_DIR="${HOME}/Applications/RsyncWebAppMenuBar.app"
BIN_PATH="${APP_DIR}/Contents/MacOS/RsyncWebAppMenuBar"
PLIST_PATH="${APP_DIR}/Contents/Info.plist"
RESOURCE_DIR="${APP_DIR}/Contents/Resources"
AGENT_LABEL="local.rsyncwebapp.menubar"
AGENT_FILE="${HOME}/Library/LaunchAgents/${AGENT_LABEL}.plist"

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun not found. Install Xcode Command Line Tools first."
  exit 1
fi

mkdir -p "${APP_DIR}/Contents/MacOS" "${RESOURCE_DIR}"
printf '%s\n' "${ROOT_DIR}" > "${RESOURCE_DIR}/repo-path.txt"

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>RsyncWebAppMenuBar</string>
  <key>CFBundleIdentifier</key>
  <string>local.rsyncwebapp.menubar.app</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundleExecutable</key>
  <string>RsyncWebAppMenuBar</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
EOF

xcrun swiftc "${SRC_FILE}" -o "${BIN_PATH}"
chmod +x "${BIN_PATH}"

mkdir -p "$(dirname "${AGENT_FILE}")"
cat > "${AGENT_FILE}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${BIN_PATH}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF

launchctl unload "${AGENT_FILE}" >/dev/null 2>&1 || true
launchctl load "${AGENT_FILE}"

echo "Menu bar app installed: ${APP_DIR}"
echo "LaunchAgent loaded: ${AGENT_LABEL}"
echo "You should see 'rsync.wa' in the macOS menu bar."
