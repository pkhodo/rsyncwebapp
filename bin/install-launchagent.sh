#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS only."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_LABEL="local.rsyncwebapp.control"
AGENT_FILE="${HOME}/Library/LaunchAgents/${AGENT_LABEL}.plist"
PORT="${RSYNC_WEBAPP_PORT:-8787}"

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
      <string>/usr/bin/env</string>
      <string>python3</string>
      <string>app/backend/server.py</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
      <key>RSYNC_WEBAPP_HOST</key>
      <string>127.0.0.1</string>
      <key>RSYNC_WEBAPP_PORT</key>
      <string>${PORT}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
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
