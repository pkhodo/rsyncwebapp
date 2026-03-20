#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS only."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_LABEL="local.rsyncwebapp.control"
AGENT_FILE="${HOME}/Library/LaunchAgents/${AGENT_LABEL}.plist"
PORT="$("${ROOT_DIR}/bin/resolve-ui-port.sh")"
LOG_DIR="${ROOT_DIR}/state/logs"

mkdir -p "${LOG_DIR}"

cat > "${AGENT_FILE}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${AGENT_LABEL}</string>
    <key>WorkingDirectory</key>
    <string>${ROOT_DIR}</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>${ROOT_DIR}/bin/run-ui-service.sh</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
      <key>RSYNC_WEBAPP_HOST</key>
      <string>127.0.0.1</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
      <key>SuccessfulExit</key>
      <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>${ROOT_DIR}/state/logs/launchagent.out.log</string>
    <key>StandardErrorPath</key>
    <string>${ROOT_DIR}/state/logs/launchagent.err.log</string>
  </dict>
</plist>
EOF

launchctl unload "${AGENT_FILE}" >/dev/null 2>&1 || true
launchctl load "${AGENT_FILE}"

echo "Installed and loaded LaunchAgent: ${AGENT_LABEL}"
echo "UI URL: http://rsync.localhost:${PORT}"
